"""OpenAI-style function schemas for the agent tools. One dialect, because every provider
we target (OpenRouter, Anthropic, Gemini, DeepSeek, OpenAI) speaks OpenAI-compatible
tool calls. The console validates on the server, so a malformed call surfaces as a
refused write rather than silent drift.
"""
from registry import TOOLS

MESSAGE_TYPES = ["TASK", "HANDOFF", "EXPERIMENT_REQUEST", "EXPERIMENT_RESULT", "INFO_REQUEST",
                 "INFO_RESPONSE", "CHALLENGE", "COUNTEREXAMPLE", "VERDICT", "BLOCKED_INFRA",
                 "APPROVAL_REQUEST", "NEW_EVIDENCE", "NOTE"]
RECIPIENTS = ["incident-lead", "support-engineer", "sre-analyst", "qa-engineer",
              "software-engineer", "release-verifier", "team", "human"]
RECORDS = ["claim", "incident", "hypothesis", "experiment", "patch", "verdict"]

_S = {
  "read_ledger": ("Read the shared evidence ledger.", {
      "record": {"type": "string", "enum": RECORDS, "description": "Omit to read everything."}}, []),

  "write_ledger": ("Write or update one ledger record. The console enforces who may write what; "
                   "a refusal comes back as an error you must act on.", {
      "record": {"type": "string", "enum": RECORDS},
      "id": {"type": "string", "description": "e.g. CLM-001, INC-1, HYP-2, EXP-3"},
      "value": {"type": "object", "description": "Record fields. See team/ledger_schema.json."}}, ["record", "id", "value"]),

  "send_message": ("Message a teammate. Every message must cite at least one ledger record or "
                   "artifact in refs; the bus refuses empty refs (except BLOCKED_INFRA).", {
      "to": {"type": "array", "items": {"type": "string", "enum": RECIPIENTS}},
      "type": {"type": "string", "enum": MESSAGE_TYPES},
      "refs": {"type": "array", "items": {"type": "string"}},
      "body": {"type": "string"},
      "cc": {"type": "array", "items": {"type": "string", "enum": RECIPIENTS}},
      "artifacts": {"type": "array", "items": {"type": "string"}},
      "requires_response": {"type": "boolean"}}, ["to", "type", "refs", "body"]),

  "done": ("Finish your turn. Call this when you have nothing further to do right now.", {
      "summary": {"type": "string"}}, ["summary"]),

  "read_tickets": ("Read the support inbox. Raw customer words, unedited.", {
      "id": {"type": "string", "description": "One ticket, or omit for all."}}, []),

  "lookup_account": ("What the account actually holds: reservations and confirmation emails sent.", {
      "account": {"type": "string"}}, ["account"]),

  "query_requests": ("Query the application request log. Some rows have no correlation id.", {
      "account": {"type": "string"}, "path": {"type": "string"}}, []),

  "query_reservations": ("Read reservations from the database.", {"account": {"type": "string"}}, []),

  "query_emails": ("Read the record of confirmation emails sent.", {"account": {"type": "string"}}, []),

  "deploy_history": ("Recent deploys: what each change touched and what it did not.", {}, []),

  "set_stage": ("Move the pipeline stage. Only you can do this. Moving backward is legitimate "
                "and is drawn as 'Sent back'.", {
      "stage": {"type": "string", "enum": ["S0", "S1", "S2", "S3", "S4", "S5"]},
      "reason": {"type": "string"},
      "refs": {"type": "array", "items": {"type": "string"}}}, ["stage", "reason"]),

  "poll_human": ("Check the room for new evidence or instructions typed by a person.", {}, []),

  "reset_sandbox": ("Put the sandbox app back to its seeded state. Do this before every run.", {}, []),

  "list_environments": ("The browser environments you can put in a matrix, and what each isolates.", {}, []),

  "run_matrix": ("Run the booking reproduction steps across chosen environments, several times each, "
                 "from a reset state. Returns a per-environment table and an attribution verdict. "
                 "Include a negative control or the result cannot be interpreted.", {
      "experiment_id": {"type": "string", "description": "e.g. EXP-3"},
      "hypothesis": {"type": "string", "description": "The HYP this experiment tests."},
      "expected_if_true": {"type": "string",
                           "description": "What you expect to see if the hypothesis holds. Required, and "
                                          "recorded before the run: no post-hoc predictions."},
      "environments": {"type": "array", "items": {"type": "string"},
                       "description": "Names from list_environments."},
      "runs": {"type": "integer", "description": "Runs per environment, 1-5. Use 3."},
      "account": {"type": "string", "description": "Defaults to A-1001."},
      "date": {"type": "string", "description": "YYYY-MM-DD, defaults to 2026-10-03."}},
      ["experiment_id", "environments", "expected_if_true"]),

  "read_repo": ("Read source files. (Task 6)", {"path": {"type": "string"}}, []),
  "run_tests": ("Run a test suite. (Task 6)", {"suite": {"type": "string"}}, []),
}


def schema_for(tool):
    desc, props, required = _S[tool]
    return {"type": "function", "function": {
        "name": tool, "description": desc,
        "parameters": {"type": "object", "properties": props, "required": required}}}


def tools_for(agent):
    return [schema_for(t) for t in TOOLS[agent]]
