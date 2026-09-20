import { AGENTS, MESSAGE_TYPES, LEDGER_WRITERS, QA_CLAIM_FIELDS, STAGES } from "./agents.js";

const KINDS = ["message", "ledger", "stage", "tool", "activity", "approval", "browser", "system"];
const BROWSER_AGENTS = ["qa-engineer", "release-verifier"]; // the only agents with a browser
const ACTIVITY_STATUSES = ["thinking", "acting", "observing", "done", "blocked", "idle"];
const RUN_PHASES = ["S0", "S1", "S2", "S3", "S4", "S5"];

function browserbaseUrl(u) {
  if (typeof u !== "string") return undefined;
  try {
    const url = new URL(u);
    const ok = url.protocol === "https:" && !url.username && !url.password && (url.hostname === "browserbase.com" || url.hostname.endsWith(".browserbase.com"));
    return ok ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function browserArtifactUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^\/api\/runs\/(run-[0-9]{8}-[a-z0-9]{6})\/artifacts\/([A-Za-z0-9][A-Za-z0-9._-]{0,159})$/);
  if (!match || match[2] === "." || match[2] === "..") return undefined;
  return value;
}
const MAX_BODY = 6000;

function isAgent(name) {
  return Object.prototype.hasOwnProperty.call(AGENTS, name);
}

/**
 * Validates one event coming from the agent runtime.
 * Returns { ok: true, event } with a normalised event, or { ok: false, reason }.
 * These checks are the message bus rules from TEAM.md, enforced server side so
 * that a misbehaving agent shows up in the room as a rejected write.
 */
export function validateWorkerEvent(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "Event is not an object." };
  const kind = raw.kind;
  if (!KINDS.includes(kind)) return { ok: false, reason: `Unknown kind "${kind}".` };
  if (kind !== "system" && !isAgent(raw.from)) {
    return { ok: false, reason: `Unknown sender "${raw.from}".` };
  }

  const event = {
    kind,
    from: raw.from || "system",
    ts: typeof raw.ts === "string" ? raw.ts : new Date().toISOString(),
  };

  if (kind === "message") {
    if (!MESSAGE_TYPES.includes(raw.type)) return { ok: false, reason: `Unknown message type "${raw.type}".` };
    const to = Array.isArray(raw.to) ? raw.to : raw.to ? [raw.to] : [];
    if (!to.length) return { ok: false, reason: "Message has no recipient." };
    for (const t of to) if (!isAgent(t) && t !== "human" && t !== "team") return { ok: false, reason: `Unknown recipient "${t}".` };
    const refs = Array.isArray(raw.refs) ? raw.refs.map(String) : [];
    if (!refs.length && raw.type !== "BLOCKED_INFRA") {
      return { ok: false, reason: "Message cites no ledger record or artifact (empty refs)." };
    }
    if (typeof raw.body !== "string" || !raw.body.trim()) return { ok: false, reason: "Message body is empty." };
    Object.assign(event, {
      id: raw.id ? String(raw.id) : undefined,
      type: raw.type,
      to,
      cc: Array.isArray(raw.cc) ? raw.cc.filter(isAgent) : [],
      refs,
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(String).slice(0, 20) : [],
      body: raw.body.slice(0, MAX_BODY),
      requires_response: !!raw.requires_response,
    });
    return { ok: true, event };
  }

  if (kind === "ledger") {
    const d = raw.data || {};
    const writers = LEDGER_WRITERS[d.record];
    if (!writers) return { ok: false, reason: `Unknown ledger record "${d.record}".` };
    if (!d.id || typeof d.value !== "object" || d.value === null) {
      return { ok: false, reason: "Ledger write needs data.id and data.value." };
    }
    if (!writers.includes(raw.from)) {
      return { ok: false, reason: `${raw.from} is not allowed to write ${d.record} records.` };
    }
    if (d.record === "claim" && raw.from === "qa-engineer") {
      const extra = Object.keys(d.value).filter((k) => !QA_CLAIM_FIELDS.includes(k));
      if (extra.length) return { ok: false, reason: `qa-engineer may only change claim status, not: ${extra.join(", ")}.` };
      if (d.value.status && !(Array.isArray(d.value.evidence) && d.value.evidence.length)) {
        return { ok: false, reason: "Claim status change needs evidence from an experiment." };
      }
    }
    if (d.record === "verdict" && d.value.result === "verified") {
      const v = d.value;
      if (!(v.regression_fails_on_base === true && v.regression_passes_on_branch === true && v.existing_suite === "pass")) {
        return { ok: false, reason: "Verdict 'verified' needs fails-on-base, passes-on-branch and a green existing suite." };
      }
    }
    event.data = { record: d.record, id: String(d.id), value: d.value };
    return { ok: true, event };
  }

  if (kind === "stage") {
    if (raw.from !== "incident-lead") return { ok: false, reason: "Only incident-lead can move the pipeline stage." };
    const d = raw.data || {};
    if (!STAGES.some((s) => s.id === d.stage)) return { ok: false, reason: `Unknown stage "${d.stage}".` };
    event.data = { stage: d.stage, reason: String(d.reason || "").slice(0, 500), refs: Array.isArray(d.refs) ? d.refs.map(String) : [] };
    return { ok: true, event };
  }

  if (kind === "tool") {
    const d = raw.data || {};
    event.data = {
      tool: String(d.tool || "tool").slice(0, 60),
      summary: String(d.summary || "").slice(0, 400),
      status: ["start", "ok", "error"].includes(d.status) ? d.status : "ok",
    };
    return { ok: true, event };
  }

  if (kind === "activity") {
    if (!isAgent(raw.from)) return { ok: false, reason: "Activity must come from a canonical agent." };
    const d = raw.data || {};
    if (!ACTIVITY_STATUSES.includes(d.status)) return { ok: false, reason: `Unknown activity status "${d.status}".` };
    if (!RUN_PHASES.includes(d.phase)) return { ok: false, reason: `Unknown activity phase "${d.phase}".` };
    const step = Number(d.step);
    if (!Number.isInteger(step) || step < 0 || step > 1_000_000) return { ok: false, reason: "Activity step must be a non-negative integer." };
    event.data = {
      status: d.status,
      summary: typeof d.summary === "string" ? d.summary.slice(0, 500) : "",
      observation: typeof d.observation === "string" ? d.observation.slice(0, 6000) : "",
      step,
      model: typeof d.model === "string" ? d.model.slice(0, 100) : "",
      phase: d.phase,
    };
    return { ok: true, event };
  }

  if (kind === "approval") {
    const d = raw.data || {};
    if (!d.id || !d.title) return { ok: false, reason: "Approval request needs data.id and data.title." };
    event.data = {
      id: String(d.id),
      title: String(d.title).slice(0, 200),
      detail: String(d.detail || "").slice(0, MAX_BODY),
      refs: Array.isArray(d.refs) ? d.refs.map(String) : [],
      url: typeof d.url === "string" && /^https:\/\//.test(d.url) ? d.url : undefined,
    };
    return { ok: true, event };
  }

  if (kind === "browser") {
    if (!BROWSER_AGENTS.includes(raw.from)) return { ok: false, reason: `${raw.from} has no browser access.` };
    const d = raw.data || {};
    if (!d.session_id) return { ok: false, reason: "Browser event needs data.session_id." };
    event.data = {
      session_id: String(d.session_id).slice(0, 80),
      provider: d.provider === "local" ? "local" : "browserbase",
      status: ["open", "closed", "failed"].includes(d.status) ? d.status : "open",
      env: String(d.env || "").slice(0, 80),
      env_detail: String(d.env_detail || "").slice(0, 300),
      experiment: d.experiment ? String(d.experiment).slice(0, 40) : undefined,
      run: Number.isFinite(Number(d.run)) ? Number(d.run) : undefined,
      target: String(d.target || "").slice(0, 200),
      outcome: d.outcome ? String(d.outcome).slice(0, 200) : undefined,
      live_url: browserbaseUrl(d.live_url),   // only browserbase.com URLs are ever embedded
      replay_url: browserbaseUrl(d.replay_url),
      current_url: typeof d.current_url === "string" ? d.current_url.slice(0, 2000) : undefined,
      title: typeof d.title === "string" ? d.title.slice(0, 300) : undefined,
      screenshot_url: browserArtifactUrl(d.screenshot_url),
      step: d.step !== undefined && d.step !== null && d.step !== "" && Number.isInteger(Number(d.step)) && Number(d.step) >= 0 ? Number(d.step) : undefined,
      action: typeof d.action === "string" ? d.action.slice(0, 400) : undefined,
    };
    return { ok: true, event };
  }

  // system
  event.type = String(raw.type || "INFO").slice(0, 40);
  event.body = String(raw.body || "").slice(0, MAX_BODY);
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    const outcome = ["running", "finished", "blocked", "cancelled", "reproduced", "not_reproduced", "inconclusive"].includes(raw.data.outcome) ? raw.data.outcome : undefined;
    const summary = typeof raw.data.summary === "string" ? raw.data.summary.slice(0, 500) : undefined;
    if (outcome || summary) event.data = { outcome, summary };
  }
  return { ok: true, event };
}

export function rejectedEvent(raw, reason) {
  return {
    kind: "system",
    from: "system",
    type: "REJECTED",
    ts: new Date().toISOString(),
    body: reason,
    data: { sender: raw && raw.from ? String(raw.from) : "unknown", attempted: raw && raw.kind ? String(raw.kind) : "unknown" },
  };
}
