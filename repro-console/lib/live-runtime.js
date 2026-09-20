import { redactSensitive } from "./customer.js";

const DEFAULT_RUNTIME_URL = "http://127.0.0.1:4318";
const RUNTIME_TIMEOUT_MS = 5000;
const RUN_ID_PATTERN = /^run-[0-9]{8}-[a-z0-9]{6}$/;
const ARTIFACT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SENSITIVE_URL_PARAMS = new Set([
  "token", "accesstoken", "refreshtoken", "idtoken", "sessiontoken", "securitytoken",
  "auth", "authorization", "apikey", "key", "password", "passwd", "secret",
  "clientsecret", "credential", "credentials", "signature", "sig", "authcode",
  "authorizationcode", "clientassertion", "assertion", "jwt", "session", "sessionid", "sid", "state",
]);

function isSensitiveUrlParam(name) {
  let key = String(name || "");
  try { key = decodeURIComponent(key); } catch { /* keep the original key */ }
  key = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_URL_PARAMS.has(key)
    || /(?:access|refresh|id|session|security|bearer|auth)?token$/.test(key)
    || /(?:api|client|private)?key$/.test(key)
    || /(?:client)?secret$/.test(key)
    || /(?:password|passwd|credential|credentials|signature|sig|assertion|jwt|session|sessionid|sid|state)$/.test(key);
}

function hasCredentialUrlFields(url) {
  for (const key of url.searchParams.keys()) {
    if (isSensitiveUrlParam(key)) return true;
  }
  // Hash routing is common in single-page apps, and OAuth credentials are
  // often placed in the fragment instead of the query string.
  let fragment = url.hash.slice(1);
  try { fragment = decodeURIComponent(fragment); } catch { /* inspect the encoded fragment as-is */ }
  const fragmentParts = fragment.split(/[/?&]/).filter(Boolean);
  return fragmentParts.some((part) => {
    const separator = part.indexOf("=");
    return separator > 0 && isSensitiveUrlParam(part.slice(0, separator));
  });
}

export class RuntimeError extends Error {
  constructor(message, status = 503, { transportError = false, ambiguous = false } = {}) {
    super(message);
    this.name = "RuntimeError";
    this.status = status;
    this.transportError = transportError;
    this.ambiguous = ambiguous;
  }
}

function runtimeConfig() {
  const token = process.env.PATCH_RUNTIME_TOKEN?.trim();
  if (!token) throw new RuntimeError("The live reproduction runtime is not configured. Set PATCH_RUNTIME_TOKEN on the console server.");
  let base;
  try {
    base = new URL(process.env.PATCH_RUNTIME_URL?.trim() || DEFAULT_RUNTIME_URL);
  } catch {
    throw new RuntimeError("PATCH_RUNTIME_URL must be a valid HTTP or HTTPS URL.", 500);
  }
  if (!(["http:", "https:"].includes(base.protocol)) || base.username || base.password || base.search || base.hash) {
    throw new RuntimeError("PATCH_RUNTIME_URL must be a base HTTP or HTTPS URL without credentials or query parameters.", 500);
  }
  return { token, base: base.toString().replace(/\/+$/, "") };
}

async function requestRuntime(path, { method = "GET", body, range } = {}) {
  const { token, base } = runtimeConfig();
  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (range) headers.set("Range", range);
  try {
    return await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new RuntimeError(timedOut
      ? "The live reproduction runtime did not respond in time. Check that it is running."
      : "The live reproduction runtime is unavailable. Start it and check PATCH_RUNTIME_URL.", 503, {
      transportError: true,
      ambiguous: true,
    });
  }
}

function shortText(value, limit) {
  return typeof value === "string" ? redactSensitive(value.trim()).slice(0, limit) : "";
}

function textList(value, itemLimit = 12, textLimit = 300) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, itemLimit).map((item) => shortText(item, textLimit)).filter(Boolean);
}

export function safeRuntimeHealth(raw) {
  if (!raw || typeof raw !== "object") return null;
  const model = (name) => shortText(raw.models?.[name], 100);
  return {
    available: true,
    ready: raw.ready === true,
    providers: {
      browserbase: { configured: raw.providers?.browserbase?.configured === true },
      local: { configured: raw.providers?.local?.configured === true },
    },
    models: { execution: model("execution"), supervisor: model("supervisor"), incidents: model("incidents") },
    missing: textList(raw.missing, 20, 240),
    repoConfigured: raw.repoConfigured === true,
  };
}

async function jsonResponse(response, serviceName) {
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 502 : 503;
    throw new RuntimeError(`${serviceName} returned an error (HTTP ${response.status}). Check its server-side configuration.`, status);
  }
  try {
    return await response.json();
  } catch {
    throw new RuntimeError(`${serviceName} returned an unreadable response.`, 502);
  }
}

export async function getRuntimeHealth() {
  const response = await requestRuntime("/health");
  const health = safeRuntimeHealth(await jsonResponse(response, "The live runtime"));
  if (!health) throw new RuntimeError("The live runtime returned an invalid readiness response.", 502);
  return health;
}

export function validateInvestigationInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Send the investigation details as JSON." };

  const targetText = typeof raw.targetUrl === "string" ? raw.targetUrl.trim() : "";
  if (!targetText || targetText.length > 2000) return { error: "Enter a target URL up to 2000 characters." };
  let target;
  try { target = new URL(targetText); } catch { return { error: "Enter a valid target URL, such as https://your-app.example." }; }
  if (!(["http:", "https:"].includes(target.protocol)) || target.username || target.password) {
    return { error: "The target URL must use HTTP or HTTPS and cannot contain a username or password." };
  }

  if (hasCredentialUrlFields(target)) {
    return { error: "The target URL cannot contain credential query or fragment fields. Remove tokens, keys, passwords, or secrets and try again." };
  }

  const originalReport = typeof raw.report === "string" ? raw.report.trim() : "";
  if (originalReport.length < 20 || originalReport.length > 8000) {
    return { error: "The report must contain between 20 and 8000 characters." };
  }
  const report = redactSensitive(originalReport).trim();
  if (report.length < 20) return { error: "The report is too short after removing personal contact details. Add more issue details." };

  if (!["browserbase", "local"].includes(raw.provider)) return { error: "Choose Browserbase or local browser for this investigation." };
  const source = raw.brief && typeof raw.brief === "object" && !Array.isArray(raw.brief) ? raw.brief : {};
  const brief = {
    title: shortText(source.title, 120) || shortText(report.split(/\r?\n/, 1)[0], 120) || "Incident report",
    summary: shortText(source.summary, 1200),
    expected: shortText(source.expected, 600),
    actual: shortText(source.actual, 600),
    environment: shortText(source.environment, 600),
    steps: textList(source.steps, 12, 240),
    unknowns: textList(source.unknowns, 12, 240),
  };
  const briefSize = Object.values(brief).flat().reduce((size, value) => size + String(value).length, 0);
  if (briefSize > 6000) return { error: "The structured brief is too long. Shorten it and try again." };

  return { value: { targetUrl: target.toString(), report, brief, provider: raw.provider } };
}

export function runtimeWorkspace() {
  const pairs = (process.env.REPRO_INGEST_TOKENS || "").split(",").flatMap((entry) => {
    const colon = entry.indexOf(":");
    if (colon < 1) return [];
    const workspace = entry.slice(0, colon).trim();
    const token = entry.slice(colon + 1).trim();
    return workspace && token ? [{ workspace, token }] : [];
  });
  const explicitWorkspace = process.env.PATCH_RUNTIME_WORKSPACE?.trim() || "";
  const explicitToken = process.env.REPRO_INGEST_TOKEN?.trim() || "";

  if (explicitWorkspace || explicitToken) {
    if (!pairs.length) {
      throw new RuntimeError("PATCH_RUNTIME_WORKSPACE or REPRO_INGEST_TOKEN is set, but no matching REPRO_INGEST_TOKENS workspace:token pair is configured.", 500);
    }
    const match = pairs.find((pair) =>
      (!explicitWorkspace || pair.workspace === explicitWorkspace)
      && (!explicitToken || pair.token === explicitToken));
    if (!match) {
      throw new RuntimeError("PATCH_RUNTIME_WORKSPACE and REPRO_INGEST_TOKEN must match the same REPRO_INGEST_TOKENS workspace:token pair.", 500);
    }
    return match.workspace;
  }

  if (pairs.length) return pairs[0].workspace;
  return "acme";
}
export function isApprover(who) {
  return who?.kind === "user" && who.role === "approver";
}

export function canAccessRun(who, run) {
  if (!who || !run || run.simulated) return false;
  if (who.kind === "user") return true;
  return who.kind === "worker" && who.workspace === run.workspace;
}

export function isSameOriginMutation(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(req.url).origin; } catch { return false; }
}

export function safeRunId(value) {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}

export function safeArtifactName(value) {
  return typeof value === "string" && ARTIFACT_PATTERN.test(value) && value !== "." && value !== "..";
}

export async function enqueueRuntimeRun({ runId, ...payload }) {
  if (!safeRunId(runId)) throw new RuntimeError("Invalid investigation id.", 400);
  const response = await requestRuntime("/runs", { method: "POST", body: { runId, ...payload } });
  if (response.status !== 202) {
    const status = response.status === 401 || response.status === 403 ? 502 : 503;
    throw new RuntimeError("The runtime did not accept this investigation. Check that it is ready, then retry.", status);
  }
}

export async function stopRuntimeRun(runId) {
  if (!safeRunId(runId)) throw new RuntimeError("Invalid investigation id.", 400);
  const response = await requestRuntime(`/runs/${encodeURIComponent(runId)}/control`, { method: "POST", body: { action: "stop" } });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 409 ? 409 : 503;
    throw new RuntimeError(response.status === 404
      ? "The runtime no longer has this investigation."
      : response.status === 409
        ? "The investigation is no longer running."
        : "The runtime could not stop this investigation. Try again in a moment.", status);
  }
}

export async function getRuntimeArtifact(runId, artifact, range) {
  if (!safeRunId(runId) || !safeArtifactName(artifact)) throw new RuntimeError("Invalid artifact path.", 400);
  return requestRuntime(`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact)}`, { range });
}
