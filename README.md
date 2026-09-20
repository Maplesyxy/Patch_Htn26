# Patch

From customer report to reproduced bug to verified fix. Built for Hack the North 2026.

Patch centers the investigation on a reproduction swarm: an execution agent operates the browser, a supervisor directs experiments, and an incidents agent follows the evidence. A fast Gemini customer agent gathers the report; an implementation agent receives the reproduction packet.

## Run the workspace

```sh
cd repro-console
npm ci
cp .env.example .env.local
# Configure Gemini, runtime and workspace credentials in .env.local.
npx playwright install chromium
npm run dev:live
```

Open http://localhost:3000. Choose **New report**, enter a website URL and bug report, select a configured browser provider, and press **Start live investigation**. The room shows browser observations, each agent's activity, and automatic phase transitions. Saving a brief is separate from launching a run. **Watch investigation** opens the labeled sample replay.

The live worker runs as a separate, long-lived Node process on port 4318. `npm run dev:live` starts it with the console; `npm run runtime` starts just the worker. For production, build first and use `npm run start:live`, or host the worker separately and configure `PATCH_RUNTIME_URL`. The Next.js server proxies worker requests with a private token.

For the included target, run `npm ci && npm run dev` in `booking-app/` and use `http://127.0.0.1:3100/book?account=A-1001` with the **Local Chromium** provider. A cloud browser needs a publicly reachable target. See [BROWSERBASE_HANDOFF.md](BROWSERBASE_HANDOFF.md) for teammate setup, event contracts, and source-fix configuration.

- `repro-console/` — Next.js workspace, event API, evidence ledger, customer intake, Node live worker, and earlier Python experiments.
- `booking-app/` — Separate application with the seeded booking defect.
- [DESIGN.md](DESIGN.md) — Current product and interface direction.
- [BRIEF.md](BRIEF.md) — Original hackathon build briefing and architecture background.
- [CODEX_LOG.md](CODEX_LOG.md) — Implementation and validation notes.

The customer defaults to `gemini-3.6-flash`, verified against the configured account. `PATCH_CUSTOMER_MODEL` overrides it. Claude Code supplies structured browser actions using `opus`; Gemini supplies supervisor reviews and incident analysis. The included booking source adapter creates an isolated review worktree, requests an Opus patch, and verifies it against a protected failing regression and an app build. Source fixing for arbitrary repositories is not configured by a website URL alone.

## Checks

```sh
cd repro-console
node --test tests/*.test.mjs
npm run build
```

Both applications are ordinary tracked folders in this repository. Original nested Git histories are preserved locally under `.git/patch-nested-history/`. Environment files, dependencies, and build outputs are ignored.
