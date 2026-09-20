import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["continue", "stop"] },
    hypothesis: { type: "string" },
    plan: { type: "string" },
    allowNetworkFault: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["decision", "hypothesis", "plan", "allowNetworkFault", "reason"],
  additionalProperties: false,
};

export const ACTION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["click", "fill", "select", "press", "scroll", "wait", "network_fault", "finish"] },
    targetId: { type: "string" },
    value: { type: "string" },
    key: { type: "string", enum: ["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Space"] },
    direction: { type: "string", enum: ["up", "down"] },
    milliseconds: { type: "integer", minimum: 0, maximum: 5000 },
    mode: { type: "string", enum: ["drop_response", "none"] },
    networkRequestId: { type: "string" },
    candidateResult: { type: "string", enum: ["reproduced", "not_reproduced", "inconclusive"] },
    summary: { type: "string" },
  },
  required: ["action", "summary"],
  additionalProperties: false,
};

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["continue", "finish", "stop"] },
    nextInstruction: { type: "string" },
    outcome: { type: "string", enum: ["reproduced", "not_reproduced", "inconclusive"] },
    summary: { type: "string" },
    evidence: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["decision", "nextInstruction", "outcome", "summary", "evidence"],
  additionalProperties: false,
};

export const INCIDENTS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" }, maxItems: 8 },
    suspicion: { type: "array", items: { type: "string" }, maxItems: 6 },
    infrastructureFailure: { type: "boolean" },
  },
  required: ["summary", "observations", "suspicion", "infrastructureFailure"],
  additionalProperties: false,
};

const GEMINI_PLAN_SCHEMA = toGeminiSchema(PLAN_SCHEMA);
const GEMINI_REVIEW_SCHEMA = toGeminiSchema(REVIEW_SCHEMA);
const GEMINI_INCIDENTS_SCHEMA = toGeminiSchema(INCIDENTS_SCHEMA);

export async function callExecutionModel(config, prompt, signal) {
  const schema = JSON.stringify(ACTION_SCHEMA);
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", schema,
    "--model", config.models.execution,
    "--effort", "low",
    "--tools", "",
    "--strict-mcp-config",
    "--mcp-config", JSON.stringify({ mcpServers: {} }),
    "--setting-sources", "",
    "--no-session-persistence",
  ];
  const result = await runChild(config.claudeCommand, args, { signal, timeoutMs: 180000 });
  const response = parseJson(result.stdout);
  if (response.is_error || response.type === "error") {
    throw claudeProcessError(result.stdout, "", 0);
  }
  const structured = response.structured_output || response.structuredOutput;
  if (structured && typeof structured === "object") return validateAction(structured);
  if (typeof response.result === "string") return validateAction(parseJson(response.result));
  throw new Error("Claude Code returned no structured browser action.");
}

export async function callSupervisor(config, prompt, signal) {
  const response = await callGemini(config, config.models.supervisor, prompt, GEMINI_REVIEW_SCHEMA, signal);
  return validateReview(response);
}

export async function createSupervisorPlan(config, prompt, signal) {
  const response = await callGemini(config, config.models.supervisor, prompt, toGeminiSchema(PLAN_SCHEMA), signal);
  return validatePlan(response);
}

export async function callIncidents(config, prompt, signal) {
  const response = await callGemini(config, config.models.incidents, prompt, GEMINI_INCIDENTS_SCHEMA, signal);
  return validateIncidents(response);
}

async function callGemini(config, model, prompt, responseSchema, signal) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", config.geminiApiKey);
  const timer = AbortSignal.timeout(90000);
  const combined = combineSignals(signal, timer);
  let response;
  try {
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema, maxOutputTokens: 1100, temperature: 0.1 },
      }),
      signal: combined,
    };
    response = await fetch(url, options);
    // A temporary provider outage must not immediately terminate a browser run.
    // Retry once, sharing the original timeout and cancellation signal.
    if ([502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      await delay(1000, undefined, { signal: combined });
      response = await fetch(url, options);
    }
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw new Error("Gemini review could not reach the configured model.");
  }
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const status = response.status;
    const safe = status === 401 || status === 403 ? "credentials were rejected" : status === 429 ? "rate limit was reached" : `returned HTTP ${status}`;
    throw new Error(`Gemini model ${model} ${safe}.`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no structured review.");
  try { return parseJson(text); } catch { throw new Error("Gemini returned an invalid structured review."); }
}

function runChild(command, args, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    let stdoutBytes = 0;
    let settled = false;
    let timer;
    let killTimer;
    let stderr = "";
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode !== null || child.signalCode !== null) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const stop = () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      killTimer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
      killTimer.unref?.();
    };
    const onAbort = () => { stop(); finish(reject, abortError()); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      stop();
      const error = new Error("Claude Code decision timed out after three minutes.");
      error.retryable = true;
      finish(reject, error);
    }, timeoutMs);
    timer.unref?.();
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 2_000_000) { stop(); finish(reject, new Error("Claude Code output exceeded its safety limit.")); return; }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      // CLI diagnostics can contain prompt fragments; never copy them into run logs.
      stderr = (stderr + chunk.toString()).slice(-6000);
    });
    child.once("error", () => {
      const error = new Error("Claude Code CLI could not be started.");
      error.retryable = true;
      finish(reject, error);
    });
    child.once("close", (code) => {
      clearTimeout(killTimer);
      if (settled) return;
      if (code !== 0) {
        finish(reject, claudeProcessError(Buffer.concat(stdout).toString("utf8"), stderr, code));
        return;
      }
      finish(resolve, { stdout: Buffer.concat(stdout).toString("utf8") });
    });
  });
}

export function claudeProcessError(stdout, stderr, code) {
  let result = "";
  try { result = String(parseJson(stdout).result || ""); } catch { /* The CLI may fail before writing JSON. */ }
  const diagnostic = `${result}\n${stderr}`;
  const authFailed = /oauth.*expired|failed to authenticate|not logged in|please (?:run.*)?log[ -]?in/i.test(diagnostic);
  const message = authFailed
    ? "Claude Code authentication expired or was rejected. Run claude auth login in the worker environment, then retry."
    : code === 0 ? "Claude Code could not produce a browser action." : `Claude Code exited with status ${code}.`;
  // Never copy CLI output into the dashboard: it can include prompts and secrets.
  const error = new Error(message);
  error.retryable = !authFailed && isTransientServiceFailure(diagnostic);
  return error;
}

function validateAction(v) {
  if (!v || !["click", "fill", "select", "press", "scroll", "wait", "network_fault", "finish"].includes(v.action)) throw new Error("Claude Code returned an unsupported browser action.");
  return {
    action: v.action,
    targetId: clean(v.targetId, 12),
    value: clean(v.value, 240),
    key: clean(v.key, 20),
    direction: v.direction === "up" ? "up" : "down",
    milliseconds: Number.isFinite(v.milliseconds) ? Math.max(0, Math.min(5000, Math.round(v.milliseconds))) : 500,
    mode: v.mode === "drop_response" ? "drop_response" : "none",
    networkRequestId: clean(v.networkRequestId, 12),
    candidateResult: ["reproduced", "not_reproduced", "inconclusive"].includes(v.candidateResult) ? v.candidateResult : "inconclusive",
    summary: clean(v.summary, 500),
  };
}

function validatePlan(v) {
  if (!v || !["continue", "stop"].includes(v.decision)) throw new Error("Supervisor returned an invalid initial plan.");
  return { decision: v.decision, hypothesis: clean(v.hypothesis, 800), plan: clean(v.plan, 1200), allowNetworkFault: Boolean(v.allowNetworkFault), reason: clean(v.reason, 600) };
}

function validateReview(v) {
  if (!v || !["continue", "finish", "stop"].includes(v.decision)) throw new Error("Supervisor returned an invalid run review.");
  return {
    decision: v.decision,
    nextInstruction: clean(v.nextInstruction, 1000),
    outcome: ["reproduced", "not_reproduced", "inconclusive"].includes(v.outcome) ? v.outcome : "inconclusive",
    summary: clean(v.summary, 1000),
    evidence: Array.isArray(v.evidence) ? v.evidence.slice(0, 8).map((x) => clean(x, 240)) : [],
  };
}

function validateIncidents(v) {
  if (!v || typeof v.summary !== "string") throw new Error("Incidents agent returned an invalid summary.");
  return {
    summary: clean(v.summary, 700),
    observations: Array.isArray(v.observations) ? v.observations.slice(0, 8).map((x) => clean(x, 300)) : [],
    suspicion: Array.isArray(v.suspicion) ? v.suspicion.slice(0, 6).map((x) => clean(x, 300)) : [],
    infrastructureFailure: Boolean(v.infrastructureFailure),
  };
}

function toGeminiSchema(schema) {
  const convert = (s) => {
    if (s.type === "object") {
      const properties = {};
      for (const [key, value] of Object.entries(s.properties || {})) properties[key] = convert(value);
      return { type: "OBJECT", properties, required: s.required || [] };
    }
    if (s.type === "array") return { type: "ARRAY", items: convert(s.items) };
    if (s.type === "string") return { type: "STRING", ...(s.enum ? { enum: s.enum } : {}) };
    if (s.type === "boolean") return { type: "BOOLEAN" };
    if (s.type === "integer" || s.type === "number") return { type: "INTEGER", ...(s.minimum !== undefined ? { minimum: s.minimum } : {}), ...(s.maximum !== undefined ? { maximum: s.maximum } : {}) };
    return { type: "STRING" };
  };
  return convert(schema);
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("Invalid JSON response.");
}

function clean(value, max) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }

function combineSignals(a, b) {
  if (!a) return b;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const controller = new AbortController();
  for (const signal of [a, b]) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function isTransientServiceFailure(diagnostic) {
  return /(?:\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b529\b|overloaded|rate limit|temporarily unavailable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|network (?:error|failure)|connection reset)/i.test(String(diagnostic || ""));
}

function abortError() { const error = new Error("Run stopped."); error.name = "AbortError"; return error; }
