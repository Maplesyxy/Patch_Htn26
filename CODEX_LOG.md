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
- The authenticated Claude implementation produced a real two-file patch on the isolated `codex/patch-run-20260920-check2` branch. All seven protected HTTP checks passed. Its first build exposed a runner bug: the production build inherited development mode. The build subprocess now explicitly uses `NODE_ENV=production` with a restricted environment. Rechecking the same generated source passed all seven checks and its production build. The original rejected run artifact is preserved.
- All 33 automated tests pass, including credential isolation and build-environment regressions. Generated source remains isolated for review; it is not merged into the included app. Validation does not cover Redis or a complete autonomous browser-model round.
- Replayed the exact real Claude proposal through the corrected adapter on `codex/patch-run-20260920-check3`, without another browser or model call. The adapter returned `verified`: base failed the two expected checks, the patch passed all seven, the production build passed, and all seven emitted events passed validation, including patch/verdict records and the review approval request. The replay is explicitly labeled in ignored local artifacts.

### UI polish and phase replay

- Redesigned the workspace with a teal, sky, rust, and warm-paper palette, an animated report-to-patch hero, clearer typography, responsive spacing, loading states, and reduced-motion support. Moved detailed workflow explanations to About.
- Made the sample replay slower with bounded timing variation, phase pauses, pause/resume and speed controls. Added clearly labeled phase illustrations and phase-specific conversation history with directional transitions. Real runtime timing and event ordering are unchanged.
- Fixed activity events rendering as empty rows and made browser captures consistently belong to the selected phase. Kept the live runtime, worker, provider adapters, and source implementation logic unchanged in this UI work.
- Checked desktop and 390px mobile layouts, intake disclosures, phase history, actual saved browser captures, no-capture states, and a full 64-event sample with pause/resume and 2× playback. Fixed cramped room columns, clipped chat content, hero overlap, and horizontal feed overflow.
- Merged teammate Browserbase and agent-model-picker updates; preserved the model selection API and storage behavior while matching the picker styling to the new interface.
- Production build and all 37 automated tests passed. Temporary browser-review routes were removed. No new external model or Browserbase sessions were needed for this UI validation.
