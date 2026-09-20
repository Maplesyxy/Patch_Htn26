"""The tools the agents actually have. Thin wrappers over ReproBus, BrowserLab and the
sandbox app's read APIs.

Three rules are enforced here rather than in the prompts:
  1. An agent can only call tools on its own allow-list (registry.TOOLS).
  2. Every call is reported to the console as a `tool` event, so the room shows work
     happening even when nothing is being said.
  3. A tool that fails is infrastructure. It raises BlockedInfra, which the orchestrator
     turns into a BLOCKED_INFRA message. It never becomes evidence and never reaches the
     ledger.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from registry import TOOLS

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


class BlockedInfra(Exception):
    """A tool, browser or network failure. Never evidence."""


class NotAllowed(Exception):
    """The agent asked for a tool it does not have. Shown in the room as a refused write."""


def _http(url, method="GET", headers=None, timeout=20):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise BlockedInfra(f"{method} {url} -> {e.code}") from None
    except Exception as e:
        raise BlockedInfra(f"{method} {url} -> {type(e).__name__}") from None


def _fixture(name):
    p = FIXTURES / name
    if not p.exists():
        raise BlockedInfra(f"fixture {name} is missing")
    return json.loads(p.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- environments
# The QA engineer designs the matrix by picking from this catalogue. It does not write
# Playwright code at run time: the reproduction steps are fixed, the environments are the
# variable. Names match team/agents/qa-engineer.md.
ENVIRONMENTS = {
    "cloud_chromium_desktop":        {"provider": "browserbase", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "fault": "none"},
    "cloud_chromium_desktop_lost":   {"provider": "browserbase", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "fault": "drop_response"},
    "cloud_chromium_phone_lost":     {"provider": "browserbase", "engine": "chromium", "viewport": {"width": 390, "height": 844}, "fault": "drop_response"},
    "cloud_chromium_adblock":        {"provider": "browserbase", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "fault": "none", "block_ads": True},
    "local_chromium_desktop":        {"provider": "local", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "fault": "none"},
    "local_chromium_desktop_lost":   {"provider": "local", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "fault": "drop_response"},
    "local_webkit_iphone":           {"provider": "local", "engine": "webkit", "device": "iPhone 14", "fault": "none"},
    "local_webkit_iphone_lost":      {"provider": "local", "engine": "webkit", "device": "iPhone 14", "fault": "drop_response"},
    "local_firefox_desktop":         {"provider": "local", "engine": "firefox", "fault": "none"},
    "local_firefox_desktop_lost":    {"provider": "local", "engine": "firefox", "fault": "drop_response"},
}

DESCRIPTIONS = {
    "cloud_chromium_desktop": "Browserbase cloud Chromium, desktop, clean network. Negative control.",
    "cloud_chromium_desktop_lost": "Browserbase cloud Chromium, desktop, server processes the request then the reply is dropped.",
    "cloud_chromium_phone_lost": "Browserbase cloud Chromium at phone viewport, reply dropped.",
    "cloud_chromium_adblock": "Browserbase cloud Chromium with ad blocking on. Tests the content-blocker theory.",
    "local_chromium_desktop": "Local Chromium, clean network. Negative control.",
    "local_chromium_desktop_lost": "Local Chromium, reply dropped.",
    "local_webkit_iphone": "Local WebKit (Safari engine, emulated iPhone 14), clean network.",
    "local_webkit_iphone_lost": "Local WebKit (Safari engine, emulated iPhone 14), reply dropped.",
    "local_firefox_desktop": "Local Firefox, clean network.",
    "local_firefox_desktop_lost": "Local Firefox, reply dropped.",
}


class ToolBox:
    def __init__(self, bus, target=None, sandbox_admin=None, on_ledger=None):
        self.bus = bus
        self.target = (target or os.environ.get("TARGET", "http://localhost:3100")).rstrip("/")
        self.admin = sandbox_admin if sandbox_admin is not None else os.environ.get("SANDBOX_ADMIN", "")
        self.on_ledger = on_ledger or (lambda *a: None)
        self.ledger = {r: {} for r in ["claim", "incident", "hypothesis", "experiment", "patch", "verdict"]}
        self.stage = "S0"
        self.messages = []

    # -- dispatch -----------------------------------------------------------------
    def call(self, agent, tool, args):
        if tool not in TOOLS.get(agent, []):
            raise NotAllowed(f"{agent} has no tool called {tool!r}. Available: {', '.join(TOOLS.get(agent, []))}")
        fn = getattr(self, f"t_{tool}", None)
        if fn is None:
            raise NotAllowed(f"{tool!r} is not implemented in this runtime yet.")
        return fn(agent, args)

    def _report(self, agent, tool, summary, status="ok"):
        try:
            self.bus.tool(agent, tool, summary[:400], status)
        except Exception:
            pass  # the room missing a tool line must never stop the run

    def _sandbox(self, path, method="GET"):
        return _http(self.target + path, method, {"x-sandbox-admin": self.admin})

    # -- available to everyone ------------------------------------------------------
    def t_read_ledger(self, agent, args):
        record = args.get("record")
        self._report(agent, "read_ledger", f"read {record or 'all records'}")
        return self.ledger.get(record, {}) if record else self.ledger

    def t_write_ledger(self, agent, args):
        record, rid, value = args.get("record"), str(args.get("id", "")), args.get("value")
        if not record or not rid or not isinstance(value, dict):
            raise NotAllowed("write_ledger needs record, id and a value object.")
        # The console is the authority on the permission table; it refuses and logs a
        # REJECTED event. We surface the reason to the agent so it can correct itself.
        self.bus.ledger(agent, record, rid, value)
        self.ledger.setdefault(record, {})
        self.ledger[record][rid] = {**self.ledger[record].get(rid, {}), **value, "id": rid}
        self.on_ledger(record, rid, value)
        self._report(agent, "write_ledger", f"{record} {rid}")
        return {"written": rid}

    def t_send_message(self, agent, args):
        mid = self.bus.message(
            agent, args.get("to"), args.get("type"), args.get("refs") or [], args.get("body") or "",
            cc=args.get("cc") or [], artifacts=args.get("artifacts") or [],
            requires_response=bool(args.get("requires_response")),
        )
        self.messages.append({"from": agent, **args})
        return {"sent": mid}

    def t_done(self, agent, args):
        return {"done": True, "summary": args.get("summary", "")}

    # -- support-engineer -------------------------------------------------------------
    def t_read_tickets(self, agent, args):
        """The seeded inbox plus anything a real person has submitted on the site.

        A report typed into /feedback during the demo arrives here on the next read, which
        is the whole point: a judge files a bug and watches it enter the pipeline.
        """
        data = _fixture("tickets.json")
        tickets = list(data["tickets"])

        live = []
        try:
            for f in self._sandbox("/api/sandbox/feedback")["feedback"]:
                live.append({
                    "id": f["id"],
                    "account": f.get("account"),
                    "channel": "review" if f.get("kind") == "review" else "web_report",
                    "received": f.get("created_at"),
                    "subject": f.get("subject", ""),
                    "body": f.get("body", ""),
                    "rating": f.get("rating"),
                    "restaurant": f.get("restaurant"),
                    "reported_from_page": f.get("page"),
                    "client_hint": f.get("client_hint"),
                    "internal_notes": ["Submitted live on the site. Unverified, like any other report."],
                })
        except BlockedInfra:
            # The site being unreachable must not blank the inbox. Say so instead.
            live = []
            self._report(agent, "tickets", "live feedback unreachable; seeded inbox only", "error")

        tickets += live
        if args.get("id"):
            tickets = [t for t in tickets if t["id"] == args["id"]]
        self._report(agent, "tickets", f"read {len(tickets)} tickets ({len(live)} submitted live)")
        return {"count": len(tickets), "live_reports": len(live), "tickets": tickets, "note": data["_note"]}

    def t_lookup_account(self, agent, args):
        acct = args.get("account", "")
        self._report(agent, "account lookup", f"{acct}")
        res = self._sandbox(f"/api/sandbox/reservations?account={acct}")
        em = self._sandbox(f"/api/sandbox/emails?account={acct}")
        return {"account": acct, "reservations": res["reservations"], "confirmation_emails": em["emails"]}

    # -- sre-analyst --------------------------------------------------------------------
    def t_query_requests(self, agent, args):
        q = []
        if args.get("account"): q.append(f"account={args['account']}")
        if args.get("path"): q.append(f"path={args['path']}")
        qs = ("?" + "&".join(q)) if q else ""
        self._report(agent, "log query", f"/api/sandbox/requests{qs}")
        out = self._sandbox(f"/api/sandbox/requests{qs}")
        return {"query": f"/api/sandbox/requests{qs}", **out}

    def t_query_reservations(self, agent, args):
        acct = args.get("account", "")
        self._report(agent, "db read", f"reservations for {acct or 'all accounts'}")
        return self._sandbox(f"/api/sandbox/reservations?account={acct}")

    def t_query_emails(self, agent, args):
        acct = args.get("account", "")
        self._report(agent, "db read", f"emails for {acct or 'all accounts'}")
        return self._sandbox(f"/api/sandbox/emails?account={acct}")

    def t_deploy_history(self, agent, args):
        self._report(agent, "deploy history", "read")
        return _fixture("deploys.json")

    # -- incident-lead ---------------------------------------------------------------------
    def t_set_stage(self, agent, args):
        stage = args.get("stage")
        self.bus.stage(stage, args.get("reason", ""), args.get("refs") or [])
        self.stage = stage
        return {"stage": stage}

    def t_poll_human(self, agent, args):
        self._report(agent, "poll human", "checking the room for new evidence")
        return {"events": self.bus.poll_human()}

    # -- qa-engineer ---------------------------------------------------------------------
    def t_reset_sandbox(self, agent, args):
        self._report(agent, "sandbox", "reset to seeded state")
        return self._sandbox("/api/sandbox/reset", "POST")

    def t_list_environments(self, agent, args):
        return {"environments": [{"name": k, "description": DESCRIPTIONS[k]} for k in ENVIRONMENTS]}

    def t_run_matrix(self, agent, args):
        from experiments import run_experiment  # imported late: needs playwright
        exp_id = args.get("experiment_id") or "EXP-?"
        names = args.get("environments") or []
        unknown = [n for n in names if n not in ENVIRONMENTS]
        if unknown:
            raise NotAllowed(f"Unknown environments: {', '.join(unknown)}. Call list_environments first.")
        if not names:
            raise NotAllowed("run_matrix needs at least one environment. Include a negative control.")
        expected = str(args.get("expected_if_true") or "").strip()
        if not expected:
            raise NotAllowed("State expected_if_true BEFORE running. No post-hoc predictions.")
        runs = max(1, min(5, int(args.get("runs") or 3)))
        self._report(agent, "browser lab", f"{exp_id}: {len(names)} environments x {runs} runs", "start")
        try:
            result = run_experiment(self.bus, agent, exp_id, self.target, self.admin, names, runs,
                                    account=args.get("account") or "A-1001",
                                    date=args.get("date") or "2026-10-03")
        except BlockedInfra:
            raise
        except Exception as e:
            raise BlockedInfra(f"browser lab: {type(e).__name__}: {str(e)[:160]}") from None
        self._report(agent, "browser lab", f"{exp_id}: {result['attribution']['verdict']}", "ok")

        # The lab's matrix and attribution are written to the EXP record here, verbatim.
        # qa-engineer.md says "do not soften or strengthen it"; persisting it in the tool
        # rather than asking the model to copy it is what makes that a rule instead of a wish.
        verdict = result["attribution"]["verdict"]
        record = {
            "hypothesis": args.get("hypothesis"),
            "run_by": agent,
            "conditions": result["conditions"],
            "expected_if_true": expected,
            "observed": result["observed"],
            "matrix": result["matrix"],
            "attribution": result["attribution"],
            "runs": result["conditions"]["runs_per_environment"] * result["conditions"]["environments"],
            "outcome": ("supports" if verdict.startswith("website_defect")
                        else "infra_failure" if verdict == "inconclusive" and result["infra_failures"]
                        else "inconclusive"),
        }
        self.t_write_ledger(agent, {"record": "experiment", "id": exp_id, "value": record})
        result["ledger_record_written"] = exp_id
        return result

    # -- S3-S5, Task 6 ------------------------------------------------------------------
    def t_read_repo(self, agent, args):
        raise NotAllowed("read_repo is not wired yet (Task 6: Fix and Verify).")

    def t_run_tests(self, agent, args):
        raise NotAllowed("run_tests is not wired yet (Task 6: Fix and Verify).")
