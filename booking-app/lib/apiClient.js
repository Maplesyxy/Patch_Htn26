"use client";

// Browsers on flaky connections drop responses. One retry on a transport error
// keeps the booking flow from failing for people on patchy mobile networks.

const RETRY_AFTER_MS = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (p) => `${p}-${Math.random().toString(16).slice(2, 8)}`;

export function newRequestIds() {
  return { correlationId: rid("c"), idempotencyKey: rid("k") };
}

async function send(path, payload, headers) {
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// A rejected fetch is the transport giving up. An HTTP error reached us, so the
// server answered and there is nothing to retry.
const isTransportError = (err) => err && err.status === undefined;

export async function postBooking(payload, { correlationId, idempotencyKey }) {
  try {
    return await send("/api/bookings", payload, {
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId,
      "Idempotency-Key": idempotencyKey,
    });
  } catch (err) {
    if (!isTransportError(err)) throw err;
    await sleep(RETRY_AFTER_MS);
    // Same idempotency key, so the server can collapse the duplicate.
    return send("/api/bookings", payload, {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    });
  }
}
