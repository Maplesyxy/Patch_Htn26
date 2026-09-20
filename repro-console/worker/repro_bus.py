"""
repro_bus: the message bus your agents use. Standard library only.

Every agent action goes through this class, so the console shows exactly what
happened and nothing else. Wire it into JiuwenSwarm by calling these methods
from each agent's tools / hooks (send message, write ledger, run tool).

    bus = ReproBus.start("Double booking complaints, week 38",
                         instruction="Investigate these complaints and open a reviewable fix.")
    bus.ledger("support-engineer", "claim", "CLM-001", {...})
    bus.message("qa-engineer", "incident-lead", "EXPERIMENT_RESULT",
                refs=["EXP-3", "HYP-3"], body="HYP-3 supported ...")
"""
import json
import os
import time
import urllib.error
import urllib.request

NO_REFS_ALLOWED = {"BLOCKED_INFRA"}


class BusRejected(Exception):
    """The console refused a write (permission table or bus rule)."""


class ReproBus:
    def __init__(self, run_id, base_url=None, token=None):
        self.base = (base_url or os.environ["REPRO_CONSOLE_URL"]).rstrip("/")
        self.token = token or os.environ["REPRO_INGEST_TOKEN"]
        self.run_id = run_id
        self.cursor = 0  # last human event seen
        self._msg_n = 0
        self._held = []  # human events read while waiting for something else

    # ---- lifecycle ---------------------------------------------------------
    @classmethod
    def start(cls, title, instruction="", base_url=None, token=None):
        self = cls(None, base_url, token)
        out = self._call("POST", "/api/runs", {"title": title, "instruction": instruction})
        self.run_id = out["run"]["id"]
        print(f"Watch live: {self.base}/runs/{self.run_id}")
        return self

    def finish(self, summary=""):
        self._emit({"kind": "system", "type": "RUN_FINISHED", "body": summary})

    # ---- what agents can do -------------------------------------------------
    def message(self, sender, to, type, refs, body, cc=None, artifacts=None, requires_response=False):
        if not refs and type not in NO_REFS_ALLOWED:
            # Fail fast locally too: an agent that cannot cite anything has nothing to say.
            raise BusRejected(f"{sender}: message cites no ledger record or artifact")
        self._msg_n += 1
        msg_id = f"MSG-{self._msg_n:04d}"
        self._emit({
            "kind": "message", "id": msg_id, "from": sender,
            "to": to if isinstance(to, list) else [to], "cc": cc or [],
            "type": type, "refs": refs, "artifacts": artifacts or [],
            "body": body, "requires_response": requires_response,
        })
        return msg_id

    def ledger(self, sender, record, record_id, value):
        self._emit({"kind": "ledger", "from": sender, "data": {"record": record, "id": record_id, "value": value}})

    def stage(self, stage, reason, refs=None):
        self._emit({"kind": "stage", "from": "incident-lead", "data": {"stage": stage, "reason": reason, "refs": refs or []}})

    def tool(self, sender, tool, summary, status="ok"):
        """status: start | ok | error. Tool errors are infrastructure, never evidence."""
        self._emit({"kind": "tool", "from": sender, "data": {"tool": tool, "summary": summary, "status": status}}, strict=False)

    def browser(self, sender, session_id, status, env="", env_detail="", experiment=None, run=None,
                target="", outcome=None, live_url=None, replay_url=None, provider="browserbase"):
        """A browser session opened / closed / failed. live_url is embedded in the room while status is open."""
        self._emit({"kind": "browser", "from": sender, "data": {
            "session_id": session_id, "status": status, "provider": provider, "env": env, "env_detail": env_detail,
            "experiment": experiment, "run": run, "target": target, "outcome": outcome,
            "live_url": live_url, "replay_url": replay_url}}, strict=False)

    def request_approval(self, sender, approval_id, title, detail, refs=None, url=None):
        self._emit({"kind": "approval", "from": sender, "data": {"id": approval_id, "title": title, "detail": detail, "refs": refs or [], "url": url}})

    # ---- what humans did ----------------------------------------------------
    def poll_human(self):
        """New evidence typed into the room and approval decisions since the last call."""
        out = self._call("GET", f"/api/runs/{self.run_id}/events?after={self.cursor}&human=1")
        self.cursor = out["cursor"]
        events, self._held = self._held + out["events"], []
        return events

    def wait_for_decision(self, approval_id, timeout=3600, every=2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            events = self.poll_human()
            for i, e in enumerate(events):
                if e["kind"] == "decision" and e["data"]["approval"] == approval_id:
                    self._held = events[:i] + events[i + 1:]  # keep the rest for the next poll_human()
                    return e["data"]  # {decision: approved|rejected, note, actor}
            self._held = events
            time.sleep(every)
        return None

    # ---- plumbing -------------------------------------------------------------
    def _emit(self, event, strict=True):
        event.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        out = self._call("POST", f"/api/runs/{self.run_id}/events", {"events": [event]})
        if out.get("rejected") and strict:
            raise BusRejected(out["rejected"][0]["reason"])
        return out

    def _call(self, method, path, body=None, retries=4):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(retries):
            req = urllib.request.Request(self.base + path, data=data, method=method, headers={
                "Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    return json.loads(res.read() or b"{}")
            except urllib.error.HTTPError as e:
                payload = e.read().decode(errors="replace")
                if e.code < 500:
                    raise RuntimeError(f"{method} {path} -> {e.code}: {payload}") from None
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1.5 * (attempt + 1))  # console unreachable: back off, do not lose the event
        raise RuntimeError(f"{method} {path}: console unreachable after {retries} attempts")
