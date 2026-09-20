"""The stage machine: S0 Intake -> S1 Correlate -> S2 Reproduce.

Intake runs support-engineer and sre-analyst genuinely concurrently, because neither
should wait for the other and the Leader must not cluster on one source. Bus writes are
serialised behind a lock; the slow part (the model calls) overlaps.

S3-S5 are Task 6. The S2->S3 gate is closed here rather than absent, so the room shows
the gate refusing rather than the pipeline quietly stopping.
"""
import json
import threading

import gates
import schemas
from llm import client_for
from repro_bus import BusRejected
from tools import BlockedInfra, NotAllowed

RUNTIME_CONTRACT = """

---
# Runtime contract

You are running inside the Repro agent runtime. Everything you do happens through tool
calls; prose that is not a tool call is not recorded and nobody sees it.

- Reply with a tool call every turn. Call `done` when your task is finished.
- `send_message` must cite at least one ledger record or artifact in `refs`. The bus
  refuses empty refs (except BLOCKED_INFRA). Write the record first, then cite it.
- The console enforces the permission table. If a write comes back refused, read the
  reason and correct it; do not repeat the same call.
- A tool error that says BLOCKED_INFRA is infrastructure. It is never evidence, never a
  claim, and never changes a status.
- Ids: claims CLM-nnn, incidents INC-n, hypotheses HYP-n, experiments EXP-n.
- No customer names or email addresses in anything you write. Account and ticket ids only.
"""


class Orchestrator:
    def __init__(self, bus, team, toolbox, scripts=None, max_steps=14, log=print):
        self.bus = bus
        self.team = team
        self.tools = toolbox
        self.scripts = scripts or {}
        self.max_steps = max_steps
        self.log = log
        self.lock = threading.Lock()
        self.clients = {}
        self.handoffs = set()
        self.stage = "S0"
        self.transcript = []

    # ------------------------------------------------------------------ state for gates
    def state(self):
        return {"handoffs": set(self.handoffs), "ledger": self.tools.ledger,
                "regression_test": None}

    # ------------------------------------------------------------------ one agent turn
    def run_agent(self, name, task):
        agent = self.team[name]
        # One client per agent for the life of the run: an agent called twice (the lead in
        # S1 and again in S2) continues where it left off rather than restarting.
        if name not in self.clients:
            try:
                self.clients[name] = client_for(agent, self.scripts)
            except Exception as e:
                # Raised in a worker thread, so say it loudly here or the run just looks
                # like a gate holding for no reason.
                self.log(f"  [{name}] cannot start: {e}")
                with self.lock:
                    try:
                        self.bus.message(name, "incident-lead", "BLOCKED_INFRA", [],
                                         f"{name} could not start: {str(e)[:300]}")
                    except Exception:
                        pass
                return
        client = self.clients[name]
        tools = schemas.tools_for(name)
        messages = [
            {"role": "system", "content": agent.prompt + RUNTIME_CONTRACT},
            {"role": "user", "content": task},
        ]
        for step in range(self.max_steps):
            try:
                msg = client.complete(messages, tools)
            except Exception as e:
                self.log(f"  [{name}] model error: {e}")
                with self.lock:
                    try:
                        self.bus.message(name, "incident-lead", "BLOCKED_INFRA", [],
                                         f"Model call failed: {str(e)[:300]}")
                    except Exception:
                        pass
                return
            messages.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
            calls = msg.get("tool_calls") or []
            if not calls:
                messages.append({"role": "user", "content":
                                 "That was not a tool call. Respond with a tool call, or `done` if you are finished."})
                continue
            for tc in calls:
                fname = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"].get("arguments") or "{}")
                except Exception:
                    args = {}
                result, finished = self._invoke(name, fname, args)
                messages.append({"role": "tool", "tool_call_id": tc["id"],
                                 "content": json.dumps(result, default=str)[:8000]})
                self.transcript.append({"agent": name, "tool": fname, "args": args})
                if finished:
                    return
        self.log(f"  [{name}] hit the {self.max_steps}-step cap without calling done")

    def _invoke(self, name, fname, args):
        """Returns (result_for_the_model, agent_is_finished)."""
        with self.lock:
            try:
                if fname == "set_stage":
                    return self._guarded_stage(name, args), False
                result = self.tools.call(name, fname, args)
                if fname == "send_message" and args.get("type") == "HANDOFF" \
                        and "incident-lead" in (args.get("to") or []):
                    self.handoffs.add(name)
                self.log(f"  [{name}] {fname} {self._brief(args)}")
                return result, fname == "done"
            except NotAllowed as e:
                self.log(f"  [{name}] refused: {e}")
                return {"error": str(e)}, False
            except BlockedInfra as e:
                self.log(f"  [{name}] BLOCKED_INFRA: {e}")
                try:
                    self.bus.message(name, "incident-lead", "BLOCKED_INFRA", [], f"{fname}: {e}")
                except Exception:
                    pass
                return {"error": f"BLOCKED_INFRA: {e}. This is infrastructure, not evidence. "
                                 "Do not record it as a finding."}, False
            except BusRejected as e:
                self.log(f"  [{name}] console refused: {e}")
                return {"error": f"The console refused this write: {e}"}, False
            except Exception as e:
                self.log(f"  [{name}] {fname} failed: {type(e).__name__}: {e}")
                return {"error": f"{type(e).__name__}: {str(e)[:300]}"}, False

    def _guarded_stage(self, name, args):
        to = args.get("stage")
        ok, reason = gates.check(self.state(), self.stage, to)
        if not ok:
            self.log(f"  [{name}] GATE HELD {self.stage}->{to}: {reason}")
            self.bus.message(name, "team", "NOTE", [f"stage:{self.stage}"],
                             f"Stage move {self.stage} -> {to} refused by the gate. {reason}")
            return {"error": f"Gate refused {self.stage} -> {to}. {reason}"}
        self.tools.call(name, "set_stage", args)
        self.log(f"  [{name}] stage {self.stage} -> {to} ({reason})")
        self.stage = to
        return {"stage": to, "gate": reason}

    @staticmethod
    def _brief(args):
        for k in ("record", "type", "experiment_id", "stage", "account", "id"):
            if args.get(k):
                return f"{k}={args[k]}"
        return ""

    # ------------------------------------------------------------------ the pipeline
    def run(self, instruction):
        self.log("\nS0 Intake: support-engineer and sre-analyst, concurrently")
        threads = [
            threading.Thread(target=self.run_agent, args=("support-engineer", INTAKE_SUPPORT.format(instruction=instruction))),
            threading.Thread(target=self.run_agent, args=("sre-analyst", INTAKE_SRE.format(instruction=instruction))),
        ]
        for t in threads: t.start()
        for t in threads: t.join()

        # The S0->S1 gate is the one the orchestrator owns: it asks whether both independent
        # witnesses have reported before the lead is allowed to see the board at all. The
        # lead still owns the move itself, and the interesting judgement (S1->S2) stays with it.
        ok, reason = gates.check(self.state(), "S0", "S1")
        if not ok:
            self.log(f"\nGATE HELD S0->S1: {reason}")
            self.bus.message("incident-lead", "team", "NOTE", ["stage:S0"],
                             f"Cannot open S1. {reason}")
            return self.stage
        with self.lock:
            self._guarded_stage("incident-lead", {
                "stage": "S1", "reason": reason,
                "refs": sorted(self.tools.ledger.get("claim", {}))[:6]})

        self.log("\nS1 Correlate: incident-lead")
        self.run_agent("incident-lead", CORRELATE.format(instruction=instruction))

        if self.stage != "S2":
            self.log(f"\nStopped at {self.stage}: the lead did not open S2.")
            return self.stage

        self.log("\nS2 Reproduce: qa-engineer")
        self.run_agent("qa-engineer", REPRODUCE)

        self.log("\nS2 review: incident-lead reads the results")
        self.run_agent("incident-lead", REVIEW)
        return self.stage


INTAKE_SUPPORT = """S0 INTAKE. The instruction for this run is: {instruction}

Read the support inbox and turn it into sourced claims. Verify what customers assert
against the account where you can, and record mismatches rather than resolving them.
Fill missing_fields honestly. Then HANDOFF to incident-lead with your counts.
Write each claim to the ledger before you cite it."""

INTAKE_SRE = """S0 INTAKE. The instruction for this run is: {instruction}

Work in parallel with support-engineer; do not wait for their claims. Do a blind pass over
the request log first, looking for duplicate writes, identical payloads close in time, and
gaps. Then check the deploy history against any claim that this was already fixed: say what
that change touched and what it did NOT touch. Write log-derived claims with the query in
evidence. State silence explicitly. Then HANDOFF to incident-lead."""

CORRELATE = """S1 CORRELATE. The instruction for this run is: {instruction}

Both witnesses have reported. Read the ledger. Cluster claims into incidents, merging only
on hard identifiers. Two confirmation emails is not two reservations: if a report is about
duplicate emails rather than duplicate reservations, it is a separate incident.

Then write competing hypotheses. Each needs `predicts` and `would_be_refuted_by`, including
the hypotheses you think are wrong but that a source asserted.

When your hypotheses are falsifiable, call set_stage to S2 and send one EXPERIMENT_REQUEST
per hypothesis to qa-engineer."""

REPRODUCE = """S2 REPRODUCE. Read the ledger for the hypotheses and the experiment requests
addressed to you.

You have two different instruments, and picking the wrong one wastes the round:

  run_probes  forks you into 2-3 clones that race different KINDS of experiment at once,
              each on its own account and sitting. Use it first when you do not yet know
              what makes the failure appear. A strategy that does not reproduce is still
              a result: it rules a theory out for everyone.
  run_matrix  answers one question only, "is it the website or the customer's browser",
              by running fixed steps across browser engines and network conditions.

Start with list_strategies and race the two or three that match the competing hypotheses.
Then, if the answer turns on environment, follow up with a matrix.

Design one matrix that splits the most hypotheses at once. Call list_environments first.
Include a negative control: a clean browser on a clean network must produce exactly one
reservation, or your experiment is not measuring what you think. Reset the sandbox, run at
least 3 times per environment, and write the matrix and the attribution verdict into the
EXP record exactly as the lab returns it. Then send EXPERIMENT_RESULT to incident-lead."""

REVIEW = """The experiment results are in the ledger. Update each hypothesis' status to
`supported` or `refuted`, citing the EXP that did it. If your leading hypothesis was
refuted, say so explicitly rather than quietly dropping it. Then try to move to S3."""
