# Repro: Agent Team Design

Six agents, modelled on how a real engineering org takes a customer complaint to a shipped fix:
Support -> Incident triage -> Observability -> QA repro -> Engineering -> Review/QA gate -> Support close-out.

| Agent | Real-world analog | JiuwenSwarm role | One-line job |
|---|---|---|---|
| `incident-lead` | Incident Commander / Eng Manager | Leader | Owns the hypothesis board, schedules experiments, enforces stage gates |
| `support-engineer` | Tier-2 Support / Escalation Engineer | Teammate | Turns raw tickets into sourced claims; owns customer follow-ups and replies |
| `sre-analyst` | SRE / Observability Engineer | Teammate | Reconstructs what the system actually did from logs, deploys, DB state |
| `qa-engineer` | SDET / QA Engineer | Teammate | Runs controlled experiments; the only agent that can mark something "observed" |
| `software-engineer` | Product Engineer (on-call dev) | Teammate | Root-causes from the failing test, patches on an isolated branch |
| `release-verifier` | Code Reviewer + QA sign-off | Teammate | Independently tries to break the patch; the only agent that can mark "verified" |

A human is the seventh participant: approves PR merge, customer sends, and anything touching production.

## Pipeline (stage gates)

```
S0 INTAKE        support-engineer + sre-analyst run IN PARALLEL on tickets / logs
S1 CORRELATE     incident-lead clusters claims into candidate incidents, opens hypotheses
S2 REPRODUCE     qa-engineer runs experiments per hypothesis (parallel where independent)
S3 FIX           software-engineer patches  ||  release-verifier writes acceptance tests BLIND to the patch
S4 VERIFY        release-verifier runs protected tests + adversarial cases against the patch
S5 RELEASE PREP  draft PR (engineer) + ticket updates & reply drafts (support) -> HUMAN APPROVAL
```

Gate conditions (enforced in code, not by prompt):
- S1->S2: every hypothesis has at least one falsifiable experiment attached.
- S2->S3: a regression test exists that FAILS on `main`. No failing test, no fix stage.
- S3->S4: patch is on a branch; diff touches no file under `tests/protected/`.
- S4->S5: regression test fails on `main`, passes on branch; existing suite green; verifier verdict = `verified`.
- Any gate can send work BACKWARD (S4->S3 on counterexample, S2->S0 on missing info). Backward edges are the demo.

## Collaboration model

Hub-and-spoke for scheduling, peer-to-peer for substance. The Lead assigns and gates, but teammates message
each other directly. These are the peer channels that matter:

| From -> To | Why |
|---|---|
| sre-analyst -> qa-engineer | "Logs show two POST /bookings 3.1s apart, same payload, one client click event." Becomes an experiment design. |
| qa-engineer -> support-engineer | INFO_REQUEST: "Need browser + network type for customer B." Support asks the customer or marks unknown. |
| qa-engineer -> sre-analyst | "Reproduced locally; does prod log signature match this trace?" Confirms repro is the SAME bug customers hit. |
| release-verifier -> software-engineer | COUNTEREXAMPLE with a failing test file. Not an opinion. |
| software-engineer -> sre-analyst | "Is there an idempotency key or request ID on this route in prod?" |
| support-engineer -> incident-lead | CHALLENGE on a merge: "Ticket 14 has 2 emails but 1 reservation, should not be in INC-1." |
| anyone -> incident-lead | CHALLENGE a hypothesis by proposing a falsifying experiment. |

### Rule: disagreements are settled by execution
No voting, no "I think". A CHALLENGE must carry a proposed experiment. The Lead schedules it; the result updates the ledger.
If an experiment cannot distinguish the two positions, both stay open as `unresolved`.

### Message envelope
```json
{
  "id": "MSG-0042",
  "from": "release-verifier",
  "to": "software-engineer",
  "cc": ["incident-lead"],
  "type": "COUNTEREXAMPLE",
  "refs": ["PATCH-2", "HYP-3", "EXP-9"],
  "artifacts": ["artifacts/tests/test_retry_after_lost_response.py", "artifacts/traces/exp9.zip"],
  "body": "Single click + dropped response still yields 2 reservations. Button disable does not cover client auto-retry.",
  "requires_response": true
}
```
Types: `TASK`, `HANDOFF`, `EXPERIMENT_REQUEST`, `EXPERIMENT_RESULT`, `INFO_REQUEST`, `INFO_RESPONSE`,
`CHALLENGE`, `COUNTEREXAMPLE`, `VERDICT`, `BLOCKED_INFRA`, `APPROVAL_REQUEST`.

The bus REJECTS any message with empty `refs` (except `BLOCKED_INFRA`). This one check kills most hallucinated chatter.

`BLOCKED_INFRA` (browser crashed, container down) never writes to the evidence ledger. Tool failure is not product evidence.

## Separation of duties (ledger + tool permissions)

| | claims | incidents | hypotheses | experiments | patches | verdicts | repo write | tests/protected | browser | logs/DB read | ticket system |
|---|---|---|---|---|---|---|---|---|---|---|---|
| incident-lead | r | **rw** | **rw** | r (assign) | r | r | - | - | - | - | r |
| support-engineer | **rw** (source=customer/support) | r | r | r | r | r | - | - | - | - | **rw (drafts)** |
| sre-analyst | **rw** (source=system) | r | r | r | r | r | - | - | - | **r** | - |
| qa-engineer | status->observed/contradicted | r | r | **rw** | r | r | tests/repro/ only | - | **yes** | r | - |
| software-engineer | r | r | r | r | **rw** | r | branch only | **no** | - | r | - |
| release-verifier | r | r | r | **rw** | r | **rw** | tests/protected/ only | **yes** | **yes** | r | - |

Two invariants worth stating in your pitch:
1. The agent that writes the fix cannot write or edit the tests that judge it.
2. The agent that schedules work (Lead) cannot produce evidence or override a verdict. It can only re-scope or escalate to a human.

## Website or browser: the environment matrix
"Only on my phone" might be true of the browser, or only of the reporter. QA settles it by running the same steps across:
clean cloud Chromium on Browserbase (nothing of the customer's machine in it), cloud Chromium with the suspected trigger,
and local WebKit / Firefox for engine differences (Browserbase is Chromium only). Negative controls are mandatory.
The lab returns an attribution that goes into the EXP record, and every Browserbase session is recorded and can be watched live in the console.
The verifier reruns the same matrix against the fix branch's preview URL in S4.

## Mapping to JiuwenSwarm
- Team mode with `incident-lead` as Leader, the rest as predefined Teammates; each `agents/*.md` becomes that member's `AGENT.md`.
- `team-workspace/artifacts/` holds `ledger/`, `tests/`, `traces/`, `patches/`, `reports/`.
- Stage gates = task dependencies. Backward edges = Leader creating a new task from a `COUNTEREXAMPLE` / `INFO_REQUEST` event.
- Browser work via `worker/browser_lab.py` (Browserbase + local Playwright), exposed as a tool ONLY to qa-engineer and release-verifier. The console refuses browser events from anyone else.
- Use skill visibility `deny` at team level to enforce the permission table (e.g. deny git-write skill to everyone but software-engineer).
- HITL step at S5 for PR and customer-reply approval.
- Persistent team: TEAM_MEMORY accumulates lessons ("retry bugs present as 'mobile only' reports") across incidents. Good reusability story.

## Expected trace on the seeded double-booking bug
1. support-engineer: 18 tickets -> 31 claims. Flags T-07 "fixed last week" as source=internal, status=reported (not fact).
2. sre-analyst: finds pairs of POST /bookings with identical payload 2-4s apart; notes missing correlation IDs; notes last week's deploy only touched the button component.
3. incident-lead: INC-1 duplicate reservations, INC-2 duplicate emails (kept SEPARATE). HYP-1 double-click, HYP-2 mobile browser, HYP-3 retry after lost response.
4. qa-engineer: EXP-1 double-click -> contradicted (button already disabled). EXP-2 desktop+mobile, clean network -> not reproduced. EXP-3 abort response via route interception -> 2 reservations on BOTH desktop and mobile. HYP-3 supported, HYP-2 refuted.
5. qa -> sre: "does prod signature match?" sre: yes for 6/7 INC-1 tickets; T-11 has no logs -> stays unresolved.
6. software-engineer: PATCH-1 (first attempt). release-verifier, in parallel and blind, has written: retry-same-attempt -> 1 reservation; two genuine bookings -> 2 reservations.
7. release-verifier -> software-engineer: COUNTEREXAMPLE if PATCH-1 is client-only or dedupes too aggressively. PATCH-2: server-side idempotency key.
8. VERDICT verified. Draft PR + 3 reply templates (confirmed/fix proposed, unrelated/email issue, need more info) -> human approval.
