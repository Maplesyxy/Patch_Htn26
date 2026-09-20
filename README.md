# Patch

From customer report to reproduced bug to verified fix. Built for Hack the North 2026.

Patch centers the investigation on a reproduction swarm: an execution agent operates the browser, a supervisor directs experiments, and an incidents agent follows the evidence. A fast Gemini customer agent gathers the report; an implementation agent receives the reproduction packet.

## Run the workspace

```sh
cd repro-console
npm ci
cp .env.example .env.local
# Configure GEMINI_API_KEY and the workspace credentials in .env.local.
npm run dev
```

Open http://localhost:3000. Choose **New report** for Gemini intake or **Watch investigation** for the labeled sample replay. Intake briefs can be saved locally, copied, or downloaded; they do not automatically launch the worker.

- `repro-console/` — Next.js workspace, event API, evidence ledger, customer intake, and Python worker.
- `booking-app/` — Separate application with the seeded booking defect.
- [DESIGN.md](DESIGN.md) — Current product and interface direction.
- [BRIEF.md](BRIEF.md) — Original hackathon build briefing and architecture background.
- [CODEX_LOG.md](CODEX_LOG.md) — Implementation and validation notes.

The customer defaults to `gemini-3.6-flash`, verified against the configured account. `PATCH_CUSTOMER_MODEL` overrides it. The proposed Claude Code execution and implementation adapters remain future integration work; the website preserves the existing worker event contract.

## Checks

```sh
cd repro-console
node --test tests/customer.test.mjs
npm run build
```

Both applications are ordinary tracked folders in this repository. Original nested Git histories are preserved locally under `.git/patch-nested-history/`. Environment files, dependencies, and build outputs are ignored.
