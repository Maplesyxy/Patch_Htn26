"""A scripted walk through S0-S2 used to test the runtime without model keys.

This is a WIRING HARNESS. It is not the agents and it is not a demo: the tool calls are
fixed, but every one of them really executes -- real bus writes, real console rules, real
browsers, real reservations. It exists so the gates, the permission table, the parallel
intake and the browser lab can be proved before a single token is spent.

It deliberately includes two mistakes, to prove the runtime catches them:
  * the lead first tries to open S2 with an unfalsifiable hypothesis (gate holds)
  * the lead then tries to open S3 with no regression test (gate holds by design)
"""

SCRIPT = {
  "support-engineer": [
    {"tool": "read_tickets"},
    {"tool": "lookup_account", "args": {"account": "A-1002"}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-001", "value": {
        "statement": "Pressed Book once and has two reservations for the same night.",
        "source": {"kind": "customer", "ref": "T-01"},
        "entities": {"account_id": "A-1001"}, "missing_fields": ["device", "app_version"],
        "status": "reported", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-002", "value": {
        "statement": "Reporter believes it happened on a phone, model not stated.",
        "source": {"kind": "customer", "ref": "T-02"},
        "entities": {"account_id": "A-1001", "device": None}, "missing_fields": ["device"],
        "status": "reported", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-003", "value": {
        "statement": "Received two identical confirmation emails for one booking on the 24th.",
        "source": {"kind": "customer", "ref": "T-03"},
        "entities": {"account_id": "A-1002"}, "missing_fields": [],
        "status": "reported", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-004", "value": {
        "statement": "Account A-1002 holds one reservation, and two confirmation emails were sent for it.",
        "source": {"kind": "db", "ref": "account lookup A-1002"},
        "entities": {"account_id": "A-1002", "reservation_ids": ["R-100"]},
        "contradicts": ["CLM-003"], "status": "observed", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-005", "value": {
        "statement": "A support colleague asserts this was fixed last week and is probably user error.",
        "source": {"kind": "support_note", "ref": "T-07"},
        "missing_fields": ["deploy_sha"], "status": "reported", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-006", "value": {
        "statement": "Duplicate reservations reported on desktop Chrome, no phone involved.",
        "source": {"kind": "customer", "ref": "T-08"},
        "entities": {"account_id": "A-1006", "device": "desktop Chrome"},
        "contradicts": ["CLM-002"], "status": "reported", "set_by": "support-engineer"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-007", "value": {
        "statement": "Caller reported duplicates but the call dropped before date or device were captured.",
        "source": {"kind": "customer", "ref": "T-11"},
        "missing_fields": ["date", "device", "reservation_ids"],
        "status": "unresolved", "set_by": "support-engineer"}}},
    {"tool": "send_message", "args": {
        "to": ["incident-lead"], "type": "HANDOFF",
        "refs": ["CLM-001", "CLM-003", "CLM-004", "CLM-005", "CLM-006", "CLM-007"],
        "body": "14 tickets, 7 claims. 1 contradiction found: A-1002 asserts a double booking but the "
                "account holds one reservation and two emails. T-07 is an internal assertion that this was "
                "fixed last week, recorded as reported, not fact. T-04 and T-11 have no usable identifiers."}},
    {"tool": "done", "args": {"summary": "Intake complete, handed off."}},
  ],

  "sre-analyst": [
    {"tool": "query_requests", "args": {"path": "/api/bookings"}},
    {"tool": "deploy_history"},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-101", "value": {
        "statement": "Two POST /api/bookings entries share idempotency key k-91c4a2; the second has no correlation id.",
        "source": {"kind": "log", "ref": "GET /api/sandbox/requests?path=/api/bookings"},
        "entities": {"account_id": "A-1004"}, "evidence": ["Q-301", "Q-302"],
        "status": "observed", "set_by": "sre-analyst"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-102", "value": {
        "statement": "Both duplicate writes returned 201. No error was logged on either.",
        "source": {"kind": "log", "ref": "GET /api/sandbox/requests?path=/api/bookings"},
        "evidence": ["Q-301", "Q-302"], "status": "observed", "set_by": "sre-analyst"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-103", "value": {
        "statement": "The 2026-09-12 deploy a91c4f2 changed only app/book/BookingForm.jsx; it did not touch "
                     "the booking route or the client retry added on 2026-09-04.",
        "source": {"kind": "deploy", "ref": "a91c4f2"},
        "contradicts": ["CLM-005"], "status": "observed", "set_by": "sre-analyst"}}},
    {"tool": "write_ledger", "args": {"record": "claim", "id": "CLM-104", "value": {
        "statement": "No request log rows exist for account A-1003 in the reported window.",
        "source": {"kind": "log", "ref": "GET /api/sandbox/requests?account=A-1003"},
        "status": "observed", "set_by": "sre-analyst"}}},
    {"tool": "send_message", "args": {
        "to": ["incident-lead"], "cc": ["qa-engineer"], "type": "HANDOFF",
        "refs": ["CLM-101", "CLM-102", "CLM-103", "CLM-104"],
        "body": "Blind pass over the request log: duplicate POST /api/bookings pairs sharing one idempotency "
                "key, seconds apart, the second with no correlation id, both 201, no errors. A 200 with a lost "
                "response looks healthy server-side. Deploy history refutes CLM-005: last week's change touched "
                "the button component only. Absence of logs for A-1003 is itself a finding."}},
    {"tool": "send_message", "args": {
        "to": ["qa-engineer"], "type": "NOTE", "refs": ["CLM-101"],
        "body": "Log signature suggests an experiment: one click with the response dropped after the server "
                "has processed it. The retry re-sends the same idempotency key."}},
    {"tool": "done", "args": {"summary": "Blind pass and deploy check complete."}},
  ],

  "incident-lead": [
    {"tool": "read_ledger"},
    {"tool": "write_ledger", "args": {"record": "incident", "id": "INC-1", "value": {
        "title": "Duplicate reservations from a single booking attempt",
        "claims": ["CLM-001", "CLM-002", "CLM-006", "CLM-101", "CLM-102"],
        "tickets": ["T-01", "T-02", "T-05", "T-08", "T-09", "T-14"],
        "excluded_tickets": [{"ticket": "T-03", "reason": "Two emails, one reservation. See INC-2."},
                             {"ticket": "T-12", "reason": "Two emails, one reservation. See INC-2."}],
        "unresolved_tickets": ["T-04", "T-11"],
        "match_basis": "account_id+request_id", "status": "open"}}},
    {"tool": "write_ledger", "args": {"record": "incident", "id": "INC-2", "value": {
        "title": "Duplicate confirmation emails for a single reservation",
        "claims": ["CLM-003", "CLM-004"], "tickets": ["T-03", "T-12"],
        "match_basis": "account_id+reservation_id", "status": "open",
        "excluded_from": "INC-1: the system of record shows one reservation, so this is not a duplicate booking."}}},
    # Deliberately unfalsifiable: the S1->S2 gate must refuse this.
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-1", "value": {
        "incident": "INC-1", "statement": "Customers are double-clicking the Book button.",
        "status": "proposed"}}},
    {"tool": "set_stage", "args": {"stage": "S2", "reason": "Hypotheses written.", "refs": ["INC-1"]}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-1", "value": {
        "incident": "INC-1", "statement": "Customers are double-clicking the Book button.",
        "predicts": "Two clicks produce two reservations; one click produces one, even on a bad network.",
        "would_be_refuted_by": "A single click producing two reservations while the button is disabled.",
        "status": "proposed"}}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-2", "value": {
        "incident": "INC-1", "statement": "The defect only occurs on mobile browsers.",
        "predicts": "Reproduces on an emulated phone and not on desktop, all else equal.",
        "would_be_refuted_by": "The same failure on desktop Chromium or desktop Firefox.",
        "status": "proposed"}}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-3", "value": {
        "incident": "INC-1",
        "statement": "The client retries after a lost response and the server is not idempotent.",
        "predicts": "One click plus a dropped response yields two reservations on every engine; a clean network yields one.",
        "would_be_refuted_by": "A dropped response yielding exactly one reservation.",
        "status": "proposed"}}},
    {"tool": "set_stage", "args": {"stage": "S2", "reason": "Three falsifiable hypotheses on INC-1.",
                                   "refs": ["HYP-1", "HYP-2", "HYP-3"]}},
    {"tool": "send_message", "args": {
        "to": ["qa-engineer"], "type": "EXPERIMENT_REQUEST", "refs": ["HYP-1", "HYP-2", "HYP-3"],
        "body": "One matrix that splits all three: single click everywhere, clean network versus dropped "
                "response, desktop versus phone, more than one engine. Negative controls mandatory."}},
    {"tool": "done", "args": {"summary": "S1 complete, experiment requested."}},
    # Second turn, after the experiment.
    {"tool": "read_ledger", "args": {"record": "experiment"}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-3", "value": {
        "status": "supported", "experiments": ["EXP-3"]}}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-2", "value": {
        "status": "refuted", "experiments": ["EXP-3"]}}},
    {"tool": "write_ledger", "args": {"record": "hypothesis", "id": "HYP-1", "value": {
        "status": "refuted", "experiments": ["EXP-3"]}}},
    {"tool": "write_ledger", "args": {"record": "incident", "id": "INC-1", "value": {
        "status": "confirmed_defect"}}},
    {"tool": "send_message", "args": {
        "to": ["team"], "type": "NOTE", "refs": ["HYP-2", "HYP-3", "EXP-3"],
        "body": "HYP-2 (mobile only) is refuted: the failure reproduces on desktop under the same dropped "
                "response. It was asserted by a source and it was wrong. HYP-3 is supported. INC-1 is a "
                "confirmed defect."}},
    {"tool": "set_stage", "args": {"stage": "S3", "reason": "HYP-3 supported, INC-1 confirmed.",
                                   "refs": ["HYP-3", "EXP-3"]}},
    {"tool": "done", "args": {"summary": "S2 reviewed. S3 is gated on a failing regression test."}},
  ],

  "qa-engineer": [
    {"tool": "list_environments"},
    {"tool": "reset_sandbox"},
    {"tool": "run_matrix", "args": {
        "experiment_id": "EXP-3", "hypothesis": "HYP-3",
        "expected_if_true": "A single click with the response dropped yields two reservations on every "
                            "engine; a clean network yields exactly one.",
        "environments": ["local_chromium_desktop", "local_chromium_desktop_lost",
                         "local_webkit_iphone_lost", "local_webkit_iphone", "local_firefox_desktop_lost"],
        "runs": 2, "account": "A-1001", "date": "2026-10-03"}},
    {"tool": "send_message", "args": {
        "to": ["incident-lead"], "cc": ["sre-analyst"], "type": "EXPERIMENT_RESULT",
        "refs": ["EXP-3", "HYP-1", "HYP-2", "HYP-3"],
        "body": "One click throughout. Clean network never duplicated. A dropped response duplicated on "
                "Chromium, WebKit and Firefox alike. HYP-2 (mobile only) refuted: desktop reproduces. "
                "HYP-1 (double click) refuted: the button was disabled and one click still produced two rows. "
                "HYP-3 supported. Attribution is in the EXP record verbatim."}},
    {"tool": "done", "args": {"summary": "EXP-3 run and reported."}},
  ],
}
