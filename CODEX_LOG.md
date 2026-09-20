# Build log

## 2026-09-19

- Reviewed the project brief, console event contract, and existing runtime before design.
- Used Astra for orchestration and interface design, Sol and Terra for focused product and integration ideation, and Luna for implementation.
- Consolidated two incomplete Git links into a normal repository containing both applications; preserved nested histories locally.
- Defined the customer → reproduction swarm → implementation journey while retaining canonical event identities and evidence permissions.
- Validated all 64 existing simulated events, including one rollback, two approval requests, and the final verified verdict.
- Tested Gemini provider access with synthetic input. Caught the unavailable 2.5 Flash model and verified the provider-recommended 3.6 Flash replacement.

## 2026-09-20

- Built the Patch workspace, investigation room, agent ensemble, and responsive customer intake with Luna implementation agents.
- Connected customer intake to Gemini on the server, with structured briefs, bounded conversations, secret redaction, local saving, and Markdown export. Verified a synthetic report through the browser and recovered its saved brief after reload.
- Kept replay, planned Claude Code adapters, and the manual brief handoff clearly labeled. Intake does not automatically launch the worker.
- Passed all six customer tests and the production build. Verified worker model configuration and Python syntax.
- Exercised all 64 simulated events, approval handling and duplicate rejection, write permissions, replay write protection, audit export, and SSE reconnection from the last event ID.
- Checked desktop and 390-pixel mobile layouts, navigation, filters, intake focus handling, and the investigation room. Fixed a hidden table label that caused horizontal overflow; checked the browser console for errors.
- Confirmed the Gemini key is ignored by Git and absent from tracked source and browser bundles. Local preview uses loopback-only process settings; saved authentication configuration is unchanged.
- Committed implementation milestones without co-author trailers. No remote push was performed.

### Live runtime integration

- Pushed integration checkpoints to `Maplesyxy/Patch_Htn26` on `main`, without co-author trailers. Added the live event contract, URL/report launch API, agent/browser panel, Browserbase and local Chromium adapters, and isolated booking fix adapter.
- The console proxies an authenticated long-lived Node worker. Live activity and browser frames travel through the existing ingest/SSE pipeline. Phase tabs follow actual stage events and preserve historical observations.
- Verified the Gemini customer endpoint through the intake UI and the installed authenticated Claude Code CLI with a real structured Opus response. The CLI reported `claude-opus-5` for the configured `opus` alias.
- Verified local Chromium against the included booking app: navigation, visible control discovery, filling a reported date, immutable screenshot creation, and browser cleanup.
- Ran the protected booking suite on the seeded app: repeated-key sequential and concurrent checks failed as expected; GET, validation, distinct keys, account isolation, and missing-key controls passed.
- Browserbase session creation, live view, and release are implemented against the official API contract. Live cloud testing is pending teammate credentials. Source verification is scoped to the included app's isolated local-memory store; the suite does not validate Redis behavior.
- Complete end-to-end model-loop validation remains pending at this checkpoint.

### Live flow validation and teammate handoff

- Confirmed a real Gemini intake and a live local investigation reaching Claude browser actions and Gemini supervision. A slow subsequent Claude decision stopped that round as blocked; it did not produce a product verdict. Added a three-minute action deadline and one bounded transient retry. A complete autonomous round still needs confirmation.
- Verified cancellation closes the local browser and produces `RUN_CANCELLED`. Fixed loopback launch-origin validation and the live inspector's missing React state import; the production console build passed.
- Ran a controlled Chromium trial against the included booking app: one clean click produced one reservation, one confirmation email, and one POST. Dropping the observed POST response after upstream completion made the client retry, producing two of each from one click. This trial used scripted browser actions to validate the adapter and evidence handoff.
- The protected baseline again failed only sequential and concurrent repeated-key checks. The first real implementation handoff exposed a child-process environment issue: Claude was logged in in the parent shell, but its restricted environment omitted the user identity needed to find macOS credentials. Preserving `USER` and `LOGNAME` restored login discovery. The Claude child still excludes Gemini, Browserbase, and runtime secrets, with an added isolation regression test.
- Browserbase credentials and cloud-session validation remain with the teammate; `BROWSERBASE_HANDOFF.md` describes the public target URL, provider contract, and source-origin configuration. The final real implementation check is recorded separately below.
