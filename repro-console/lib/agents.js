// Single source of truth for the team. Mirrors team/TEAM.md.
// `model` is a display label only: change it here when you change the model in the agent runtime.

export const AGENTS = {
  "incident-lead":     { label: "Incident lead",     short: "LD", role: "Incident commander", model: "Claude Opus 5", color: "#14213D" },
  "support-engineer":  { label: "Support engineer",  short: "SU", role: "Tier-2 support", model: "Gemini 3.8 Flash", color: "#B4236B" },
  "sre-analyst":       { label: "SRE analyst",       short: "SR", role: "Observability", model: "DeepSeek V4.1 Flash", color: "#0B7285" },
  "qa-engineer":       { label: "QA engineer",       short: "QA", role: "Experiments", model: "Gemini 3.1 Pro", color: "#6741D9" },
  "software-engineer": { label: "Software engineer", short: "DV", role: "Fix author", model: "Claude Sonnet 5", color: "#2F6FED" },
  "release-verifier":  { label: "Release verifier",  short: "VF", role: "Review and sign-off", model: "GPT-5.6 Sol", color: "#8A5A00" },
};

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
