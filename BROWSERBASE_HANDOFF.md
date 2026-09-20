# Browserbase integration checkpoint

The Node runner under `repro-console/worker/live/` is the URL + bug-report path used by **Start live investigation**. The earlier Python matrix (`repro-console/worker/browser_lab.py`) is a separate booking-specific experiment. The sample replay remains explicitly simulated.

## Teammate setup

Put `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in the ignored `repro-console/.env.local` on the machine running the worker. Never commit either value. Cloud browsers need a publicly reachable target URL; the included app on `127.0.0.1:3100` is usable only by the explicit local-browser provider until it is deployed or tunneled.

Install the console dependencies with `npm ci`. Configure `PATCH_RUNTIME_TOKEN`, `REPRO_INGEST_TOKENS`, and `GEMINI_API_KEY`; the example environment documents their format. Install and authenticate Claude Code. Start the console and worker with `npm run dev:live` (or `npm run runtime` beside an existing console). After changing worker credentials, restart the worker, then use **Refresh** in the report form. Choose **Browserbase** and a public target URL for the cloud round.

`browser.mjs` owns the provider integration. Its `openBrowserSession` function creates the cloud session, connects Playwright over CDP, fetches the live-view URL, and exposes bounded DOM actions, telemetry, screenshots, and cleanup. Browserbase session creation and release follow the official API references below. `config.mjs` owns readiness; `server.mjs` owns the private HTTP boundary; `orchestrator.mjs` owns the model loop and event lifecycle.

The worker owns session creation, Playwright CDP connection, screenshots, actions, and session release. The console never receives the Browserbase API key or CDP connection URL. It receives only allowlisted live-view / replay URLs and authenticated artifact paths.

## Agreed interfaces

- Private runtime: `http://127.0.0.1:4318`, authenticated with server-only `PATCH_RUNTIME_TOKEN`.
- `GET /health`: readiness, configured providers, model labels, missing configuration.
- `POST /runs`: `{runId, targetUrl, report, brief, provider}`; returns HTTP 202. Provider is explicitly `browserbase` or `local`.
- `POST /runs/:id/control`: `{action: "stop"}`.
- `GET /runs/:id/artifacts/:artifact`: authenticated screenshot, reproduction packet, patch diff, or verification report.
- Worker events continue through the existing `/api/runs/:id/events` ingest API, using `REPRO_INGEST_TOKEN` and `REPRO_CONSOLE_URL`.

The event validator now accepts an `activity` kind from canonical agents:

```json
{
  "kind": "activity",
  "from": "qa-engineer",
  "data": {
    "status": "acting",
    "summary": "Click the Book button",
    "observation": "The date and time fields are filled",
    "step": 2,
    "model": "claude-opus-5",
    "phase": "S2"
  }
}
```

Activity statuses: `thinking`, `acting`, `observing`, `done`, `blocked`, `idle`. Browser events additionally carry `current_url`, `title`, `step`, `action`, and `screenshot_url`. Screenshots must use `/api/runs/<runId>/artifacts/<basename>`. Repeated `status: "open"` events update the same session. Emit `closed` or `failed` and release the cloud session in cleanup, including cancellation.

`RUN_FINISHED`, `RUN_BLOCKED`, and `RUN_CANCELLED` are separate lifecycle events. Finishing a reproduction round does not mean a fix was verified. Stage events drive the panel's phase transitions; infrastructure errors must not become bug evidence.

## Included booking fix

Install `booking-app` dependencies and run it on port 3100. To enable the source handoff on the worker, set `PATCH_FIX_BOOKING_APP=1`, `PATCH_FIX_REPO_PATH` to the absolute Patch repository root, and `PATCH_BOOKING_APP_URL` to the exact target origin. The default origin is `http://127.0.0.1:3100`.

The adapter creates `.patch-worktrees/<runId>` on `codex/patch-<runId>`. The implementation model can propose full replacements only for the booking route and store. A protected HTTP suite must fail on the base for sequential and concurrent repeated keys, then pass on the proposed change along with the app build. Distinct keys, account isolation, missing keys, validation, and GET behavior are controls. Verification covers an isolated local-memory sandbox; Redis behavior is not validated by this suite. The review branch is not merged or pushed automatically.

The worker needs local disk for `.patch-runs/` and worktrees. A serverless Next.js deployment still needs a reachable long-lived worker. The current worker queue is in memory; restarting it interrupts active work.

## Official references

- [Create a Browserbase session](https://docs.browserbase.com/reference/api/create-a-session)
- [Browserbase live view and embedding](https://docs.browserbase.com/platform/browser/observability/session-live-view)
- [Claude Code programmatic mode](https://code.claude.com/docs/en/headless)

Cloud-session validation is pending teammate credentials. Local Chromium session creation, DOM actions, screenshots, and cleanup have passed a real booking-app smoke test. The protected suite has confirmed the expected two baseline failures and five passing controls. Complete model-loop validation is tracked in `CODEX_LOG.md`.
