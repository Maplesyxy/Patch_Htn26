// Single source of truth for the team. Mirrors team/TEAM.md.
// `model` is a display label only: change it here when you change the model in the agent runtime.

export const AGENTS = {
  "incident-lead":     { label: "Supervisor agent",     short: "SV", role: "Swarm supervisor", model: "JiuwenSwarm leader", color: "#8B684A" },
  "support-engineer":  { label: "Customer agent",        short: "CU", role: "Customer intake", model: "Gemini Flash", color: "#9B7657" },
  "sre-analyst":       { label: "Incidents agent",       short: "IN", role: "Incident signals", model: "DeepSeek V4.1 Flash", color: "#547C80" },
  "qa-engineer":       { label: "Execution agent",       short: "EX", role: "Browser experiments", model: "Gemini 3.1 Pro", color: "#6C7F9A" },
  "software-engineer": { label: "Implementation agent",  short: "IM", role: "Implementation", model: "Implementation runtime", color: "#607B55" },
  "release-verifier":  { label: "Verification agent",    short: "VE", role: "Independent verification", model: "GPT-5.6 Sol", color: "#A47A42" },
};

// Display-only grouping for the investigation room. Agent keys stay canonical
// because the runtime, reducer and authorization rules depend on them.
export const AGENT_GROUPS = [
  { label: "Customer agent", agents: ["support-engineer"] },
  { label: "Reproduction swarm", agents: ["qa-engineer", "incident-lead", "sre-analyst"] },
  { label: "Implementation", agents: ["software-engineer"] },
  { label: "Verification", agents: ["release-verifier"] },
];

export const HUMAN = { label: "Human", short: "HU", role: "Approver", color: "#3A4556" };

export const STAGES = [
  { id: "S0", name: "Intake" },
  { id: "S1", name: "Correlate" },
  { id: "S2", name: "Reproduce" },
  { id: "S3", name: "Fix" },
  { id: "S4", name: "Verify" },
  { id: "S5", name: "Release prep" },
];

export const MESSAGE_TYPES = [
  "TASK", "HANDOFF", "EXPERIMENT_REQUEST", "EXPERIMENT_RESULT", "INFO_REQUEST", "INFO_RESPONSE",
  "CHALLENGE", "COUNTEREXAMPLE", "VERDICT", "BLOCKED_INFRA", "APPROVAL_REQUEST", "NEW_EVIDENCE", "NOTE",
];

// Message types that push work backward through the pipeline.
export const PUSHBACK_TYPES = ["CHALLENGE", "COUNTEREXAMPLE", "INFO_REQUEST"];

// Separation of duties: who may write which ledger record.
export const LEDGER_WRITERS = {
  claim:      ["support-engineer", "sre-analyst", "qa-engineer"],
  incident:   ["incident-lead"],
  hypothesis: ["incident-lead"],
  experiment: ["qa-engineer", "release-verifier"],
  patch:      ["software-engineer"],
  verdict:    ["release-verifier"],
};

// qa-engineer may only move claim status; it cannot author or reword claims.
export const QA_CLAIM_FIELDS = ["status", "evidence", "history"];

export const REF_PREFIX_TO_RECORD = {
  CLM: "claim", INC: "incident", HYP: "hypothesis", EXP: "experiment", PATCH: "patch", VER: "verdict",
};

export function recordTypeForRef(ref) {
  const prefix = String(ref).split("-")[0];
  return REF_PREFIX_TO_RECORD[prefix] || null;
}
