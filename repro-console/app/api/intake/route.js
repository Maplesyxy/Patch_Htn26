import { authorize, json } from "@/lib/auth";
import { cleanCustomerResponse, customerModel, validateConversation } from "@/lib/customer";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_INSTRUCTION = `You are Patch's customer support intake assistant. Help a customer describe one software problem clearly. Ask one concise question at a time, prioritizing what they observed, what they expected, reproduction steps, and their environment (device, operating system, browser/app version, network, and relevant account state). Ask for exactly one missing fact per reply; do not bundle separate questions or join requests with "and". Be warm and concise. Do not pretend to run code, start an investigation, or contact an agent. Patch is the investigation tool, not the customer's app or account. Never infer that money was charged, that the customer has a Patch account, or who owns the affected app. Do not invent facts or reproduction steps. Build the incident brief only from facts the customer gave you; put missing details in unknowns. Do not put customer names, email addresses, phone numbers, credentials, API keys, or other secrets in the brief. Preserve technical identifiers such as ticket, account, and trace IDs when they help identify the issue. If a customer includes personal contact details or secrets, omit them. Keep the reply to at most two short sentences and ask only one concise question. Return only the requested JSON object.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    brief: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        summary: { type: "STRING" },
        expected: { type: "STRING" },
        actual: { type: "STRING" },
        environment: { type: "STRING" },
        steps: { type: "ARRAY", items: { type: "STRING" } },
        unknowns: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["title", "summary", "expected", "actual", "environment", "steps", "unknowns"],
    },
    ready: { type: "BOOLEAN" },
  },
  required: ["reply", "brief", "ready"],
};

export async function GET(req) {
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to use customer intake." }, 401);
  return json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    provider: "Google Gemini",
    model: customerModel(),
    canUse: who.role === "approver",
  });
}

export async function POST(req) {
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to use customer intake." }, 401);
  if (who.role !== "approver") return json({ error: "Customer intake generation is available to approvers only." }, 403);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "Gemini is not configured. Add GEMINI_API_KEY to .env.local, then restart the app." }, 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  const parsed = validateConversation(body?.messages);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const model = customerModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: parsed.messages,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1800,
          ...(model.startsWith("gemini-3")
            ? { thinkingConfig: { thinkingLevel: "minimal" } }
            : model.startsWith("gemini-2.5")
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) return json({ error: "Gemini rejected the configured API key. Check GEMINI_API_KEY and try again." }, 502);
      if (upstream.status === 429) return json({ error: "Gemini is busy or the project has reached its quota. Wait a moment, then retry." }, 503);
      if (upstream.status === 408 || upstream.status === 504) return json({ error: "Gemini took too long to respond. Your message is still here; try again." }, 504);
      return json({ error: "Gemini could not complete this intake. Check the model configuration and try again." }, 502);
    }
    let payload;
    try {
      payload = await upstream.json();
    } catch {
      return json({ error: "Gemini returned an unreadable response. Try again." }, 502);
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => typeof part?.text === "string" ? part.text : "").join("");
    let generated;
    try {
      generated = cleanCustomerResponse(JSON.parse(text || ""));
    } catch {
      generated = null;
    }
    if (!generated?.reply || !generated.brief.summary) return json({ error: "Gemini returned an incomplete intake. Your message is still here; try again." }, 502);
    return json(generated);
  } catch (error) {
    if (error?.name === "AbortError") return json({ error: "Gemini took too long to respond. Your message is still here; try again." }, 504);
    return json({ error: "Could not reach Gemini. Your message is still here; check your connection and retry." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
