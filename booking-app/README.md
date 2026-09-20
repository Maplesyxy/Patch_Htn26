# Sandbox booking app

The system under test for the Repro agent team. A restaurant booking form, a reservations
API, and the three read-only logs an investigator would reach for.

Everything in here is synthetic. Account ids only; no names, no email addresses.

> This deployment carries a seeded defect on purpose. The root cause is deliberately not
> written down in this repo, because the agents read this repo.

## Run it

```
npm install
npm run dev            # http://localhost:3100
curl -X POST http://localhost:3100/api/sandbox/reset
open http://localhost:3100/book?account=A-1001
```

## Deploy

Its own Vercel project, separate from the console.

1. Push this folder to its own GitHub repo. `main` is the branch under investigation.
2. Import it on Vercel. Framework is detected as Next.js; no build settings to change.
3. Storage > Marketplace > **Upstash for Redis**. Not optional: see "Why Redis" below.
4. Settings > Environment Variables: `SANDBOX_ADMIN` = `openssl rand -hex 16`.
5. **Settings > Deployment Protection > off**, or issue a bypass token. A Browserbase
   browser is on the public internet and cannot sign in to Vercel.
6. Every branch gets its own preview URL, which is what the release verifier compares:
   `main` is the base, `fix/*` is the branch.

Check it landed: `curl https://<preview>/api/health` should report
`{"store":"redis","resetProtected":true}`.

## Why Redis, and not process memory

A retried booking is two HTTP requests. On Vercel they can land on different serverless
instances. With per-instance memory the second reservation would be written somewhere the
read endpoint never looks, and the defect would appear to have fixed itself. Redis also
means `POST /api/sandbox/reset` actually resets what the next request will see.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/bookings` | `{account, date, slot}` → `{reservation}`. Reads `X-Correlation-Id` and `Idempotency-Key`. |
| GET | `/api/bookings?account=A-1001` | Same as the reservations read, plus the slot list |
| POST | `/api/sandbox/reset` | Wipe and reseed. Needs `x-sandbox-admin` when `SANDBOX_ADMIN` is set |
| GET | `/api/sandbox/reservations?account=` | The system of record |
| GET | `/api/sandbox/requests?account=&path=&limit=` | Request log. Some rows have no correlation id |
| GET | `/api/sandbox/emails?account=` | What was sent. Sends and reservations are not 1:1 |
| GET | `/api/health` | Store kind, git branch, whether reset is guarded |

Slots: `12:00 12:30 18:00 18:30 19:00 19:30 20:00`. Accounts match `A-\d{4}`.

## Seeded accounts, after a reset

| Account | Reservations | Emails | Requests | What it is for |
|---|---|---|---|---|
| `A-1001` | 0 | 0 | 0 | The account QA drives. Empty, so a run's output is unambiguous |
| `A-1002` | 1 (`R-100`) | 2 | 2 | Two confirmations, one reservation. The look-alike that is not a defect |
| `A-1003` | 0 | 0 | 0 | A complaint with nothing behind it |
| `A-1004` | 2 | 2 | 3 | Ordinary traffic, including a row with no correlation id |

## Reproduction steps used by the matrix

`worker/browser_lab.py` in the console repo drives exactly this:

```
GET  /book?account=A-1001
fill the field labelled "Date"
click the button named "Book"          # exactly one click
wait 6s                                # long enough for the client's retry to fire
GET  /api/sandbox/reservations?account=A-1001
```

with a Playwright route fault on `**/api/bookings` that lets the server process the request
and then drops the reply.
