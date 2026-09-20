"""
QA engineer's EXP-3, for real: same steps, seven environments, Browserbase + local engines.
Adapt TARGET, the selectors in steps() and the API calls in observe()/reset() to your booking app.

    export REPRO_CONSOLE_URL=...  REPRO_INGEST_TOKEN=...
    export BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=...
    export TARGET=https://booking-app-git-main-yourteam.vercel.app     # must be public, not localhost
    python worker/example_browser_matrix.py
"""
import json
import os
import urllib.request

from repro_bus import ReproBus
from browser_lab import BrowserLab, default_matrix

TARGET = os.environ["TARGET"].rstrip("/")
ACCOUNT = "A-1001"


def api(path, method="GET"):
    req = urllib.request.Request(TARGET + path, method=method, headers={"x-sandbox-admin": os.environ.get("SANDBOX_ADMIN", "")})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read() or b"{}")


def reset():
    api("/api/sandbox/reset", "POST")


def steps(page, target):
    page.goto(f"{target}/book?account={ACCOUNT}", wait_until="domcontentloaded")
    page.get_by_label("Date").fill("2026-10-03")
    page.get_by_role("button", name="Book").click()       # exactly one click
    page.wait_for_timeout(6000)                            # long enough for the client's retry to fire


def observe():
    rows = api(f"/api/sandbox/reservations?account={ACCOUNT}")["reservations"]
    return len(rows) > 1                                   # the failure: more than one reservation from one click


bus = ReproBus.start("EXP-3 across browsers", instruction="Is the double booking the website or the browser?")
bus.tool("qa-engineer", "browser lab", "EXP-3: 7 environments x 3 runs, Browserbase + local WebKit / Firefox", "start")

result = BrowserLab(bus, "qa-engineer").run_matrix("EXP-3", TARGET, steps, observe, envs=default_matrix("**/api/bookings"), runs=3, reset=reset)

total = sum(r["runs"] for r in result["matrix"])
failed = sum(r["failed"] for r in result["matrix"])
bus.ledger("qa-engineer", "experiment", "EXP-3", {
    "hypothesis": "HYP-3",
    "conditions": {"clicks": 1, "environments": len(result["matrix"])},
    "expected_if_true": "2 reservations whenever the response is lost, on every engine; 1 on a clean network",
    "observed": f"{failed}/{total} runs failed",
    "outcome": "supports" if result["attribution"]["verdict"].startswith("website_defect") else "inconclusive",
    "runs": total, **result,
})
print(json.dumps(result, indent=2))
bus.finish(result["attribution"]["because"])
