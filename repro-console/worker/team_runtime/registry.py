"""Who the six agents are, what model each runs on, and what each is allowed to call.

The prompts in team/agents/*.md are the source of truth for behaviour. This file wires
them; it does not restate them. The tool allow-list mirrors the permission table in
team/TEAM.md and is enforced again in tools.py, because a rule that lives only in a
prompt does not count.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

TEAM_DIR = Path(__file__).resolve().parents[2] / "team"
PROMPT_DIR = TEAM_DIR / "agents"

# Proposers and checkers must not share a model family (team/MODELS.md). These defaults
# are OpenRouter slugs so one key drives all six; override per agent with
# REPRO_MODEL_<AGENT_WITH_UNDERSCORES>, e.g. REPRO_MODEL_QA_ENGINEER.
DEFAULT_MODELS = {
    "incident-lead":     "anthropic/claude-opus-4.1",
    "support-engineer":  "google/gemini-2.5-flash",
    "sre-analyst":       "deepseek/deepseek-chat",
    "qa-engineer":       "google/gemini-2.5-pro",
    "software-engineer": "anthropic/claude-sonnet-4.5",
    "release-verifier":  "openai/gpt-5",
}

# team/MODELS.md "Settings"
TEMPERATURES = {
    "incident-lead": 0.3, "support-engineer": 0.0, "sre-analyst": 0.0,
    "qa-engineer": 0.2, "software-engineer": 0.0, "release-verifier": 0.4,
}

EVERY_AGENT = ["read_ledger", "send_message", "write_ledger", "done"]

TOOLS = {
    "support-engineer":  EVERY_AGENT + ["read_tickets", "lookup_account"],
    "sre-analyst":       EVERY_AGENT + ["query_requests", "query_reservations", "query_emails", "deploy_history"],
    "incident-lead":     EVERY_AGENT + ["set_stage", "poll_human"],
    "qa-engineer":       EVERY_AGENT + ["reset_sandbox", "list_environments", "run_matrix", "query_reservations"],
    # S3-S5. Wired in Task 6; listed here so the permission table is complete in one place.
    "software-engineer": EVERY_AGENT + ["read_repo", "run_tests"],
    "release-verifier":  EVERY_AGENT + ["read_repo", "run_tests", "list_environments", "run_matrix"],
}


@dataclass
class Agent:
    name: str
    model: str
    temperature: float
    tools: list
    prompt: str = ""
    base_url: str = ""
    api_key: str = ""

    @property
    def env_suffix(self):
        return self.name.upper().replace("-", "_")


def _env(agent_name, key, default=""):
    return os.environ.get(f"REPRO_{key}_{agent_name.upper().replace('-', '_')}", default)


def load_agent(name):
    path = PROMPT_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"No prompt for {name} at {path}")
    return Agent(
        name=name,
        model=_env(name, "MODEL") or DEFAULT_MODELS[name],
        temperature=float(_env(name, "TEMP") or TEMPERATURES[name]),
        tools=list(TOOLS[name]),
        prompt=path.read_text(encoding="utf-8"),
        # Per-agent endpoint overrides, so you can point one agent at a provider directly
        # while the rest go through a single router.
        base_url=_env(name, "BASE_URL") or os.environ.get("REPRO_LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=_env(name, "API_KEY") or os.environ.get("REPRO_LLM_API_KEY", ""),
    )


def load_team(names=None):
    return {n: load_agent(n) for n in (names or list(TOOLS))}


def separation_report(team):
    """The three separations team/MODELS.md says to keep if any model changes."""
    fam = lambda n: team[n].model.split("/")[0] if n in team else None
    pairs = [("software-engineer", "release-verifier"), ("qa-engineer", "release-verifier"),
             ("support-engineer", "sre-analyst")]
    out = []
    for a, b in pairs:
        if a in team and b in team:
            out.append({"pair": f"{a} vs {b}", "families": [fam(a), fam(b)], "ok": fam(a) != fam(b)})
    return out
