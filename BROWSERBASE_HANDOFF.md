# Browserbase integration checkpoint

The live runtime and UI are being implemented alongside this contract checkpoint. The existing Python matrix (`repro-console/worker/browser_lab.py`) is booking-specific; the new Node runner under `repro-console/worker/live/` is the generic URL + bug-report path. Do not mistake the simulated replay for a live run.

## Teammate setup

Put `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in the ignored `repro-console/.env.local` on the machine running the worker. Never commit either value. Cloud browsers need a publicly reachable target URL; the included app on `127.0.0.1:3100` is usable only by the explicit local-browser provider until it is deployed or tunneled.

The worker owns session creation, Playwright CDP connection, screenshots, actions, and session release. The console never receives the Browserbase API key or CDP connection URL. It receives only allowlisted live-view / replay URLs and authenticated artifact paths.

## Agreed interfaces

- Private runtime: `http://127.0.0.1:4318`, authenticated with server-only `PATCH_RUNTIME_TOKEN`.
- `GET /health`: readiness, configured providers, model labels, missing configuration.
- `POST /runs`: `{runId, targetUrl, report, brief, provider}`; returns HTTP 202. Provider is explicitly `browserbase` or `local`.
- `POST /runs/:id/control`: `{action: "stop"}`.
- `GET /runs/:id/artifacts/:artifact`: authenticated screenshot or reproduction packet.
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

## Official references

- [Create a Browserbase session](https://docs.browserbase.com/reference/api/create-a-session)
- [Browserbase live view and embedding](https://docs.browserbase.com/platform/browser/observability/session-live-view)
- [Claude Code programmatic mode](https://code.claude.com/docs/en/headless)

Cloud-session validation is pending teammate credentials. The local-provider path is being tested against the included booking app.
