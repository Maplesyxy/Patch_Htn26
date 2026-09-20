# Repro console

For the current Node live investigation flow, start with the [root README](../README.md) and [Browserbase handoff](../BROWSERBASE_HANDOFF.md). `npm run dev:live` starts the console and private worker; **New report → Start live investigation** launches a URL and report. The Python/JiuwenSwarm examples below remain available as earlier integrations.

## Browserbase integration test

With the console and worker running, run `npm run test:browserbase` from this directory. This opt-in test uses real Browserbase sessions, Gemini, and the authenticated Claude Code CLI, so it consumes provider usage. Configure the same ignored `.env.local` used by the live worker first.

The test investigates two static counter fixtures: a button that adds two instead of one, and a working control that adds one. Playwright fulfills the fixture directly inside the cloud browser; no target site or public tunnel is required. The runtime's real queue, model decisions, browser interactions, screenshots, console event ingestion, live event stream, downloadable artifacts, and session cleanup are exercised. It asserts `reproduced` for the broken fixture and `not_reproduced` for the working control. Test runs remain visible in the dashboard with an explicit integration-test title.

The test only permits clicks and waits on its fixed fixture origin, and disables source editing and network fault injection. It does not test deployment access, the report-form submission UI, or automated source fixes.

A live room for the Repro agent team: the conversation between agents as a group chat, the evidence
ledger beside it, the pipeline stage on top, and human sign-off for anything that leaves the sandbox.

## How it fits together

```
 Agent runtime (your machine / a VM)                 Vercel
 JiuwenSwarm team + Playwright + sandbox app         this Next.js app
 ┌──────────────────────────────┐   HTTPS + token   ┌──────────────────────────────┐
 │ worker/repro_bus.py          │ ────────────────▶ │ POST /api/runs/:id/events    │──▶ Upstash Redis
 │  message / ledger / stage /  │                   │  validates bus rules + perms │    (append-only log)
 │  tool / request_approval     │ ◀──────────────── │ GET  ...events?human=1       │
 └──────────────────────────────┘   polls decisions └──────────────┬───────────────┘
                                                        SSE        │  GET /api/runs/:id/stream
                                                    ┌──────────────▼───────────────┐
                                                    │ Browser: chat, ledger,       │
                                                    │ approvals, new evidence      │
                                                    └──────────────────────────────┘
```

The agents do not run on Vercel. They need a long-lived process, a browser and your app sandbox;
Vercel functions are short-lived. Vercel hosts the control plane: ingest, storage, live view, approvals, audit.

## Deploy

1. Push this folder to a GitHub repo.
2. vercel.com > Add New > Project > import the repo. Framework is detected as Next.js; no build settings to change.
3. In the project: Storage > Marketplace > **Upstash for Redis** > create and connect. This sets the Redis env vars.
4. Settings > Environment Variables (see `.env.example`):
   - `REPRO_INGEST_TOKENS` e.g. `acme:<openssl rand -hex 24>`
   - `REPRO_APPROVER_PASSWORD`, `REPRO_VIEWER_PASSWORD`
   - `REPRO_SESSION_SECRET` = `openssl rand -hex 32`
   - `GEMINI_API_KEY` for customer intake (server only); optionally set `PATCH_CUSTOMER_MODEL` (defaults to `gemini-3.6-flash`)
5. Redeploy. Open the URL, sign in as approver, press **Play simulated replay** to check streaming works.
6. Point the runtime at it:
   ```
   export REPRO_CONSOLE_URL=https://<your-app>.vercel.app
   export REPRO_INGEST_TOKEN=<the token after "acme:">
python worker/example_run.py
```
The script prints a watch link, proves a forbidden write is refused, and waits for your approval in the browser.

## Customer intake with Gemini

For local development, put `GEMINI_API_KEY` in the ignored `.env.local` file and restart `npm run dev`. In production, set the same variable in the deployment environment. The key stays on the server; the browser receives only provider readiness and the configured model name. `PATCH_CUSTOMER_MODEL` selects the Gemini model and defaults to `gemini-3.6-flash`. Only an approver can generate a brief. Saving a brief stores it in that browser and does not start an agent investigation.

If `GEMINI_API_KEY` is also set in the worker environment, `support-engineer` uses Gemini's OpenAI-compatible endpoint with `gemini-3.6-flash`. `REPRO_MODEL_SUPPORT_ENGINEER`, `REPRO_BASE_URL_SUPPORT_ENGINEER`, and `REPRO_API_KEY_SUPPORT_ENGINEER` can override its model, endpoint, and key.

CLI alternative: `npm i -g vercel && vercel link && vercel env pull && vercel --prod`.
Local: `npm install && npm run dev` (no Redis needed locally; it falls back to memory).

## Wiring JiuwenSwarm in

Give every agent the same four tools, each a thin wrapper over `ReproBus` (register them as a Skill or MCP tool):

| Agent tool | Calls | Notes |
|---|---|---|
| `send_message(to, type, refs, body, cc, artifacts)` | `bus.message(...)` | Use this INSTEAD of free-form teammate chat so the room and the agents see the same thing |
| `write_ledger(record, id, value)` | `bus.ledger(...)` | Raises `BusRejected` with the reason; feed that string back to the agent |
| `report_tool(tool, summary, status)` | `bus.tool(...)` | Call from your Playwright / git / test wrappers, not from the LLM |
| `request_approval(id, title, detail, refs)` | `bus.request_approval(...)` then `bus.wait_for_decision(id)` | Blocks S5 until a named human decides |

The Leader additionally gets `set_stage(stage, reason, refs)` and should call `bus.poll_human()` between tasks:
a `NEW_EVIDENCE` message is the "judge adds a contradictory ticket" moment and should trigger a re-cluster.

Agent prompts and the team design are in `team/`.

## Browserbase: is it the website or the browser?

`worker/browser_lab.py` runs one set of reproduction steps across a matrix of environments and returns an attribution.

- **Browserbase** gives the QA engineer and the verifier a fresh cloud Chromium per run with nothing of the customer's
  (or your) machine in it. If the bug reproduces there, it is not the customer's extensions, cache or VPN. Each session is
  recorded, and its live view is embedded in the room's **Browsers** tab while it runs (view only).
- **Local Playwright** covers WebKit (Safari's engine) and Firefox, because Browserbase sessions are Chromium.
- Per environment you can set viewport, region, proxy country, ad blocking, an uploaded extension, a persisted profile,
  and a network fault (`drop_response` lets the server process the request, then cuts the reply).
- Attribution verdicts: `website_defect`, `website_defect_network_trigger`, `browser_specific`, `environment_specific`, `not_reproduced`, `inconclusive`.
  The matrix and the verdict are stored on the experiment record and shown in the ledger.

```
pip install -r worker/requirements.txt && playwright install chromium webkit firefox
export BROWSERBASE_API_KEY=...  BROWSERBASE_PROJECT_ID=...
export TARGET=https://<booking-app-preview>.vercel.app      # public URL, not localhost
python worker/example_browser_matrix.py
```

Things that will bite you:
1. **A cloud browser cannot reach localhost.** Deploy the booking app as its own Vercel project; every branch gets a preview URL,
   which is exactly what the verifier needs (main vs fix branch). Turn off Deployment Protection for it or pass a bypass token.
2. **Browserbase keys stay in the worker.** The console never sees them; it only receives the live-view and recording links,
   and only embeds URLs on browserbase.com.
3. **A live-view link can control the browser.** The room renders it view-only, but treat the link as a secret: signed-in users only.
4. **Concurrency and minutes are plan-limited.** The default matrix is 4 cloud environments x 3 runs = 12 sessions per experiment,
   run one at a time. Cut `runs` to 2 if you are burning through the allowance.
5. `browser_lab.py` follows the Browserbase Python SDK docs but was written without a live account to test against. Run the example once early.

## What the server enforces (so it shows in the room, not just in prompts)

- Messages with no `refs` are refused (except `BLOCKED_INFRA`).
- Ledger permission table: only `release-verifier` writes verdicts, only `incident-lead` writes incidents and
  hypotheses, `software-engineer` writes patches only, `qa-engineer` may change a claim's status only with experiment evidence.
- A verdict of `verified` must carry fails-on-base, passes-on-branch and a green suite.
- Only `incident-lead` moves the stage. Moving to an earlier stage is drawn as "Sent back".
- Browser events are accepted only from `qa-engineer` and `release-verifier`.
- Refused writes are appended to the log as `REJECTED` events. They are part of the audit record.
- A token can only write to runs in its own workspace. Simulated runs cannot receive real events and are labelled everywhere.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/runs` | worker token | Create a run `{title, instruction}` |
| POST | `/api/runs/:id/events` | worker token | Append `{events:[...]}` (max 100). 207 if any were refused |
| GET | `/api/runs/:id/events?after=N&human=1` | worker or user | Read the log; `human=1` returns only human input |
| GET | `/api/runs/:id/stream` | user | Server-sent events, resumes from `Last-Event-ID` |
| POST | `/api/runs/:id/human` | approver | `{mode:"message", body}` or `{mode:"decision", approval, decision, note}` |
| GET | `/api/runs/:id/export` | worker or user | Full audit JSON |
| GET | `/api/intake` | signed-in user | Gemini configuration status and model (no key) |
| POST | `/api/intake` | approver | Generate a support reply and structured incident brief |

Event kinds: `message`, `ledger`, `stage`, `tool`, `activity`, `browser`, `approval`, `decision` (human only), `system`. Shapes are in `lib/validate.js`. The live launch routes are `GET /api/runtime`, `POST /api/investigations`, `POST /api/runs/:id/control`, and `GET /api/runs/:id/artifacts/:artifact`.

## Enterprise readiness: what is real and what is not

Real today: role separation (viewer / approver / worker), per-workspace ingest tokens, server-side separation of duties,
named human approvals, append-only event log with export, security headers, no secrets in the browser.

Not done, and you should say so if asked:
- **SSO and per-user accounts.** Sign-in is two shared passwords plus a typed name. Swap `lib/auth.js` `authorize()` for
  Clerk, Auth.js or WorkOS; every route already goes through that one function.
- **Tenant isolation for viewers.** Workspaces isolate writers. Every signed-in person sees every workspace.
- **Retention, deletion, PII controls.** The log keeps everything forever. Keep customer names and emails out of events (the support agent prompt already requires this).
- **Artifact hosting.** The Node worker serves screenshots, reproduction packets, and verification artifacts through the authenticated console proxy from local disk. Durable object storage and retention are not configured.

## Limits to know before the demo

- Streaming: each SSE connection lasts ~50s and the browser reconnects automatically; the "Live" badge only changes if reconnecting takes over 3s.
- Every open room polls Redis about once a second. Fine for a demo; for many viewers move to Redis pub/sub or a hosted realtime service.
- Without Redis on Vercel, runs will flicker in and out (the home page warns you).
- The simulated replay is paced by the browser tab that opened it. Close the tab and it pauses; reopen and it continues.
