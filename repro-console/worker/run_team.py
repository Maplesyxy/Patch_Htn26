"""Run the Repro agent team against the sandbox booking app, reporting live to the console.

    export REPRO_CONSOLE_URL=http://localhost:3000
    export REPRO_INGEST_TOKEN=...
    export TARGET=http://localhost:3100          # the booking app
    export SANDBOX_ADMIN=...                     # must match the booking app's

    export REPRO_LLM_API_KEY=...                 # one router key drives all six models
    python worker/run_team.py

    # or, with no keys at all, to prove the wiring, the gates and the browsers:
    REPRO_LLM_PROVIDER=mock python worker/run_team.py
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE / "team_runtime")]

from registry import load_team, separation_report          # noqa: E402
from repro_bus import ReproBus                             # noqa: E402
from tools import ToolBox                                  # noqa: E402
from orchestrator import Orchestrator                      # noqa: E402

INSTRUCTION = os.environ.get(
    "REPRO_INSTRUCTION",
    "Investigate these customer complaints and open a reviewable fix for any confirmed defect.",
)

S0_TO_S2 = ["support-engineer", "sre-analyst", "incident-lead", "qa-engineer"]


def main():
    mock = os.environ.get("REPRO_LLM_PROVIDER") == "mock"
    team = load_team(S0_TO_S2)

    print("Team:")
    for n, a in team.items():
        print(f"  {n:19} {'mock (wiring harness)' if mock else a.model}")
    print("\nProposer / checker separation:")
    for r in separation_report(load_team()):
        print(f"  {r['pair']:42} {r['families'][0]} vs {r['families'][1]}  {'ok' if r['ok'] else 'VIOLATION'}")

    title = "Duplicate booking complaints" + (" (wiring harness)" if mock else "")
    bus = ReproBus.start(title, instruction=INSTRUCTION)
    if mock:
        bus._emit({"kind": "system", "type": "INFO",
                   "body": "Models are mocked: the tool calls are scripted, but every tool really ran. "
                           "This is a wiring test, not an agent run."}, strict=False)

    toolbox = ToolBox(bus)
    scripts = {}
    if mock:
        from mock_script import SCRIPT
        scripts = SCRIPT

    orch = Orchestrator(bus, team, toolbox, scripts=scripts)
    stage = orch.run(INSTRUCTION)

    print(f"\nFinished at stage {stage}.")
    print(f"Ledger: " + ", ".join(f"{k} {len(v)}" for k, v in toolbox.ledger.items() if v))
    bus.finish(f"Run ended at {stage}.")
    print(f"\nRoom: {bus.base}/runs/{bus.run_id}")


if __name__ == "__main__":
    main()
