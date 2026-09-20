// Deterministic sandbox state, rebuilt by POST /api/sandbox/reset before every experiment.
//
// Synthetic data. Account ids only, no names or email addresses anywhere.

import { addEmail, addRequest, addReservation, setCounter, wipe } from "./store";

const BASE = "2026-09-16T09:00:00.000Z";
const at = (minutes) => new Date(Date.parse(BASE) + minutes * 60000).toISOString();

// A-1001  the account QA drives. Starts empty so a run's reservations are unambiguous.
// A-1002  the look-alike: ONE reservation, TWO confirmation emails (the mailer retried).
// A-1003  a complaint with nothing behind it: no reservations, no requests.
// A-1004  ordinary traffic, so the log is not suspiciously tidy.
const SEED_RESERVATIONS = [
  { id: "R-100", account: "A-1002", date: "2026-09-24", slot: "18:30", created_at: at(20), source: "web" },
  { id: "R-101", account: "A-1004", date: "2026-09-25", slot: "12:00", created_at: at(41), source: "web" },
  { id: "R-102", account: "A-1004", date: "2026-10-02", slot: "20:00", created_at: at(88), source: "web" },
  { id: "R-103", account: "A-1004", date: "2026-10-02", slot: "9:00", created_at: at(90), source: "web", party_size: 2 },
];

const SEED_EMAILS = [
  // One reservation, two sends: the mail worker retried after a provider timeout.
  { id: "E-200", account: "A-1002", reservation: "R-100", template: "booking_confirmation", sent_at: at(20), attempt: 1 },
  { id: "E-201", account: "A-1002", reservation: "R-100", template: "booking_confirmation", sent_at: at(23), attempt: 2 },
  { id: "E-202", account: "A-1004", reservation: "R-101", template: "booking_confirmation", sent_at: at(41), attempt: 1 },
  { id: "E-203", account: "A-1004", reservation: "R-102", template: "booking_confirmation", sent_at: at(88), attempt: 1 },
];

const SEED_REQUESTS = [
  { id: "Q-300", ts: at(20), method: "POST", path: "/api/bookings", status: 201, account: "A-1002",
    correlation_id: "c-8f21a0", idempotency_key: "k-3d9e11", reservation: "R-100", duration_ms: 214 },
  { id: "Q-301", ts: at(41), method: "POST", path: "/api/bookings", status: 201, account: "A-1004",
    correlation_id: "c-2b77de", idempotency_key: "k-91c4a2", reservation: "R-101", duration_ms: 188 },
  // Correlation id missing: these came in on the retry path, which rebuilds its headers.
  { id: "Q-302", ts: at(63), method: "POST", path: "/api/bookings", status: 201, account: "A-1004",
    correlation_id: null, idempotency_key: "k-91c4a2", reservation: null, duration_ms: 402 },
  { id: "Q-303", ts: at(88), method: "POST", path: "/api/bookings", status: 201, account: "A-1004",
    correlation_id: "c-6a0f3c", idempotency_key: "k-77be05", reservation: "R-102", duration_ms: 176 },
  { id: "Q-304", ts: at(95), method: "GET", path: "/api/availability", status: 200, account: "A-1002",
    correlation_id: null, idempotency_key: null, reservation: null, duration_ms: 43 },
];

export async function reseed({ keepFeedback = true } = {}) {
  await wipe({ keepFeedback });
  for (const r of SEED_RESERVATIONS) await addReservation(r);
  for (const e of SEED_EMAILS) await addEmail(e);
  for (const q of SEED_REQUESTS) await addRequest(q);
  await setCounter(103); // next reservation is R-104
  return { reservations: SEED_RESERVATIONS.length, emails: SEED_EMAILS.length, requests: SEED_REQUESTS.length };
}
