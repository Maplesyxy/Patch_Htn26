# Tablewise — sandbox booking app

The system under test. A restaurant booking site with a catalogue, a booking flow, a
reservations list, a customer problem-report form, and the read-only logs an investigator
would reach for.

Everything in here is synthetic. Account ids only; no names, no email addresses.

> This deployment carries seeded defects on purpose. Their root causes are deliberately
> not written down in this repo, because the agents read this repo. The key lives in
> `repro-console/worker/fixtures/truth.json`, which no tool exposes.

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
| POST | `/api/bookings` | `{account, date, slot, restaurant, party_size}` → `{reservation}`. Reads `X-Correlation-Id` and `Idempotency-Key`. |
| POST | `/api/feedback` | Customer bug report or review. Account id only, no names or emails |
| GET | `/api/sandbox/feedback?kind=&since=` | What customers submitted. The agent team's live intake |
| GET | `/api/bookings?account=A-1001` | Same as the reservations read, plus the slot list |
| POST | `/api/sandbox/reset` | Wipe and reseed. Needs `x-sandbox-admin` when `SANDBOX_ADMIN` is set |
| GET | `/api/sandbox/reservations?account=` | The system of record |
| GET | `/api/sandbox/requests?account=&path=&limit=` | Request log. Some rows have no correlation id |
| GET | `/api/sandbox/emails?account=` | What was sent. Sends and reservations are not 1:1 |
| GET | `/api/health` | Store kind, git branch, whether reset is guarded |

Slots: `9:00 9:30 12:00 12:30 18:00 18:30 19:00 19:30 20:00`. Accounts match `A-\d{4}`.

## Pages

| Path | What it is |
|---|---|
| `/` | Restaurant catalogue |
| `/restaurants/<id>` | One restaurant and its sittings |
| `/book?account=&restaurant=&slot=` | The booking form. The reproduction steps drive this page |
| `/reservations?account=` | What the customer has booked |
| `/feedback?account=` | Report a problem or leave a review. This is the demo's front door |

A report submitted at `/feedback` appears in the agent team's intake on the next
`read_tickets`, so a judge can file a bug and watch it enter the pipeline.

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
