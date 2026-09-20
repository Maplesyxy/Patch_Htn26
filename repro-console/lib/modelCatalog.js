// Which model each agent may run on, and which pairings undermine the ensemble.
//
// The point of six agents is that a wrong assumption has to fool two differently
// trained systems AND an executed test. Two agents from the same family share
// blind spots, so a proposer and its checker running the same family quietly
// removes the check while still looking like one.

export const FAMILIES = {
  anthropic: { label: "Anthropic", mark: "A", color: "#a3683f" },
  google: { label: "Google", mark: "G", color: "#4f7a5c" },
  openai: { label: "OpenAI", mark: "O", color: "#5a7689" },
  deepseek: { label: "DeepSeek", mark: "D", color: "#7a6a9c" },
};

export const MODELS = {
  "opus":                 { family: "anthropic", label: "Claude Opus 5",     note: "Strongest agentic coding and long-horizon reasoning." },
  "sonnet":               { family: "anthropic", label: "Claude Sonnet 5",   note: "Near-Opus coding at lower cost and latency." },
  "haiku":                { family: "anthropic", label: "Claude Haiku 4.5",  note: "Fast and cheap. Good for extraction, not for judgement." },
  "gemini-3.6-flash":     { family: "google",    label: "Gemini 3.6 Flash",  note: "Fast, multimodal, long context. Verified on this account." },
  "gemini-3.1-pro":       { family: "google",    label: "Gemini 3.1 Pro",    note: "Stronger reasoning for experiment design." },
  "gpt-5.6-sol":          { family: "openai",    label: "GPT-5.6 Sol",       note: "Follows a verification protocol to the letter." },
  "deepseek-chat":        { family: "deepseek",  label: "DeepSeek V4.1",     note: "Cheapest capable option for high log volume." },
};

// role -> what it is, which env var carries it, what it may run on, and the default.
export const ROLES = [
  {
    id: "customer", label: "Customer agent", env: "PATCH_CUSTOMER_MODEL", icon: "inbox",
    blurb: "Interviews the customer and writes the incident brief.",
    wants: "Fast and faithful. This job is extraction, not deduction.",
    options: ["gemini-3.6-flash", "gemini-3.1-pro", "haiku", "deepseek-chat"],
    recommended: "gemini-3.6-flash",
  },
  {
    id: "supervisor", label: "Supervisor agent", env: "PATCH_SUPERVISOR_MODEL", icon: "compass",
    blurb: "Directs experiments, owns hypotheses, can interrupt the swarm.",
    wants: "Few tokens, highest leverage per token. Rival hypotheses and replanning.",
    options: ["gemini-3.6-flash", "gemini-3.1-pro", "opus", "gpt-5.6-sol"],
    recommended: "gemini-3.6-flash",
  },
  {
    id: "execution", label: "Execution agent", env: "PATCH_EXECUTION_MODEL", icon: "play",
    blurb: "Drives the browser harness and runs controlled experiments.",
    wants: "Reliable structured tool calls over long loops.",
    options: ["opus", "sonnet", "gemini-3.1-pro", "gpt-5.6-sol"],
    recommended: "opus",
  },
  {
    id: "incidents", label: "Incidents agent", env: "PATCH_INCIDENTS_MODEL", icon: "layers",
    blurb: "Reads telemetry for errors, warnings and suspicious actions.",
    wants: "Cheap and steady. Highest token volume of any role.",
    options: ["deepseek-chat", "gemini-3.6-flash", "haiku", "gemini-3.1-pro"],
    recommended: "deepseek-chat",
  },
  {
    id: "implementation", label: "Implementation agent", env: "PATCH_FIX_MODEL", icon: "code",
    blurb: "Writes the patch in an isolated worktree, inside the file allowlist.",
    wants: "Best available coding model. It proposes; it never judges its own work.",
    options: ["opus", "sonnet", "gpt-5.6-sol", "gemini-3.1-pro"],
    recommended: "opus",
  },
];

// Pairings that hollow out the ensemble. Each says plainly what stops working.
export const CONFLICTS = [
  {
    pair: ["supervisor", "implementation"],
    title: "Supervisor and Implementation share a model family",
    why: "The supervisor decides which hypothesis is worth fixing and the implementation agent acts on it. One family means one set of blind spots deciding both what is wrong and how to repair it, with nothing in between to disagree.",
  },
  {
    pair: ["customer", "incidents"],
    title: "Customer and Incidents share a model family",
    why: "These are the two independent witnesses: what a person said happened, and what the system recorded. They are only worth having separately if they can disagree.",
  },
];

export function familyOf(modelId) {
  const m = MODELS[modelId];
  return m ? m.family : null;
}

export const DEFAULTS = Object.fromEntries(ROLES.map((r) => [r.id, r.recommended]));

/** Which configured pairings are currently in conflict. */
export function conflictsFor(selection) {
  const out = [];
  for (const c of CONFLICTS) {
    const [a, b] = c.pair;
    const fa = familyOf(selection[a]);
    const fb = familyOf(selection[b]);
    if (fa && fb && fa === fb) out.push({ ...c, family: fa, roles: [a, b] });
  }
  return out;
}

export function normalise(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    for (const role of ROLES) {
      const v = raw[role.id];
      if (typeof v === "string" && role.options.includes(v)) out[role.id] = v;
    }
  }
  return out;
}
