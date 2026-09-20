"""
Smoke test for the wiring. Creates a REAL (non-simulated) run, posts a few events,
proves the console refuses a forbidden write, then waits for you to approve
something in the browser. Replace this with your JiuwenSwarm team.

    export REPRO_CONSOLE_URL=https://your-app.vercel.app
    export REPRO_INGEST_TOKEN=...
    python worker/example_run.py
"""
from repro_bus import ReproBus, BusRejected

bus = ReproBus.start("Wiring check", instruction="Check that agents can reach the console.")

bus.tool("support-engineer", "tickets", "Reading 2 tickets", "start")
bus.ledger("support-engineer", "claim", "CLM-001", {
    "statement": "Pressed Book once and has two reservations.",
    "source": {"kind": "customer", "ref": "T-01"},
    "status": "reported", "missing_fields": ["device"],
})
bus.message("support-engineer", "incident-lead", "HANDOFF", refs=["CLM-001", "T-01"],
            body="2 tickets, 1 claim. Device unknown.")

# Separation of duties is enforced by the console, not by the prompt:
try:
    bus.ledger("software-engineer", "verdict", "VER-1", {"result": "verified"})
except BusRejected as e:
    print("Refused as expected:", e)

bus.request_approval("incident-lead", "APR-1", "Wiring check sign-off",
                     "Approve or reject this in the browser to finish the script.", refs=["CLM-001"])
print("Waiting for a decision in the browser...")
decision = bus.wait_for_decision("APR-1", timeout=600)
print("Decision:", decision)

for e in bus.poll_human():
    if e["kind"] == "message":
        print("Human added evidence:", e["body"])

bus.finish("Wiring check complete.")
