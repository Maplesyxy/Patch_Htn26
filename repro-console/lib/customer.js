export const DEFAULT_CUSTOMER_MODEL = "gemini-3.6-flash";

const MODEL_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH = 8000;

export function customerModel(value = process.env.PATCH_CUSTOMER_MODEL) {
  return value && MODEL_PATTERN.test(value) ? value : DEFAULT_CUSTOMER_MODEL;
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function redactSensitive(value) {
  return String(value)
    .replace(/\b(?:my name is|customer name is|user name is|name:)\s+[\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,2}/giu, "[personal name]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?<!\w)\+?\d[\d ().-]{7,}\d\b/g, (phone, offset, source) => {
      if (isIsoCalendarDate(phone)) return phone;
      const before = source.slice(Math.max(0, offset - 32), offset);
      return /(?:ticket|account|order|booking|reservation|trace)\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*$/i.test(before) ? phone : "[phone]";
    })
    .replace(/\b(?:api[_ -]?key|access[_ -]?token|password|secret|token)\s*[:=]\s*[^\s,;]+/gi, "[credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{20,}/g, "[credential]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[credential]")
    .replace(/([?&](?:key|token|password|secret|auth)=)[^&#\s]+/gi, "$1[redacted]");
}

export function validateConversation(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_MESSAGES) {
    return { error: `Send between 1 and ${MAX_MESSAGES} conversation messages.` };
  }
  let total = 0;
  const messages = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      return { error: "Each conversation message must have a user or assistant role and text content." };
    }
    if ((i === 0 && item.role !== "user") || item.role === (i ? raw[i - 1].role : "assistant")) {
      return { error: "Conversation messages must alternate, starting with the customer." };
    }
    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return { error: `Each message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.` };
    }
    total += content.length;
    if (total > MAX_HISTORY_LENGTH) return { error: "The conversation is too long. Start a new intake with the main details." };
    messages.push({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: redactSensitive(content) }] });
  }
  if (raw[raw.length - 1].role !== "user") return { error: "The latest message must be from the customer." };
  return { messages };
}

function cleanString(value, max = 800) {
  return typeof value === "string" ? redactSensitive(value.trim()).slice(0, max) : "";
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item) => cleanString(item, 240)).filter(Boolean);
}

export function cleanCustomerResponse(value) {
  if (!value || typeof value !== "object" || !value.brief || typeof value.brief !== "object") return null;
  const brief = value.brief;
  return {
    reply: cleanString(value.reply, 500),
    brief: {
      title: cleanString(brief.title, 120) || "Incident report",
      summary: cleanString(brief.summary, 1200),
      expected: cleanString(brief.expected, 600),
      actual: cleanString(brief.actual, 600),
      environment: cleanString(brief.environment, 600),
      steps: cleanList(brief.steps),
      unknowns: cleanList(brief.unknowns),
    },
    ready: value.ready === true,
  };
}
