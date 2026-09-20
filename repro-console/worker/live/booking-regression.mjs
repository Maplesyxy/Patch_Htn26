#!/usr/bin/env node
// Protected HTTP regression suite for the included booking sandbox.
// It is copied into an isolated fix worktree before the implementation model runs.

const base = String(process.env.PATCH_BOOKING_BASE_URL || "").replace(/\/+$/, "");
const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, detail: String(error?.message || error).slice(0, 500) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(8000),
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { response, body };
}

async function reset() {
  const { response, body } = await request("/api/sandbox/reset", { method: "POST" });
  assert(response.ok && body?.ok === true, `sandbox reset failed (${response.status})`);
}

const reservation = { account: "A-1001", date: "2026-10-14", slot: "18:30" };

async function post(key, body = reservation) {
  return request("/api/bookings", {
    method: "POST",
    headers: { "idempotency-key": key },
    body: JSON.stringify(body),
  });
}

async function readSandbox(path) {
  const { response, body } = await request(`${path}?account=A-1001`);
  assert(response.ok && Array.isArray(body?.reservations || body?.emails), `${path} failed (${response.status})`);
  return body;
}

if (!base) {
  console.log(`PATCH_REGRESSION_RESULT=${JSON.stringify({ ok: false, checks: [{ name: "suite_setup", passed: false, detail: "PATCH_BOOKING_BASE_URL is required." }] })}`);
  process.exitCode = 2;
} else {
  await check("basic_get", async () => {
    const { response, body } = await request("/api/bookings?account=A-1001");
    assert(response.ok && Array.isArray(body?.reservations) && Array.isArray(body?.slots), `GET /api/bookings failed (${response.status})`);
  });

  await check("validation", async () => {
    const cases = [
      { ...reservation, account: "bad" },
      { ...reservation, date: "tomorrow" },
      { ...reservation, slot: "25:00" },
    ];
    for (const payload of cases) {
      const { response } = await post(`validation-${Math.random().toString(36).slice(2)}`, payload);
      assert(response.status === 400, `invalid payload returned ${response.status}, expected 400`);
    }
  });

  await check("same_key_sequential", async () => {
    await reset();
    const first = await post("retry-sequential-1");
    const second = await post("retry-sequential-1");
    const state = await readSandbox("/api/sandbox/reservations");
    const emails = await readSandbox("/api/sandbox/emails");
    assert(first.response.ok && second.response.ok, `POST statuses were ${first.response.status}, ${second.response.status}`);
    assert(first.body?.reservation?.id && first.body.reservation.id === second.body?.reservation?.id, "same idempotency key returned different reservation ids");
    assert(state.reservations.length === 1, `expected 1 reservation, found ${state.reservations.length}`);
    assert(emails.emails.length === 1, `expected 1 confirmation email, found ${emails.emails.length}`);
  });

  await check("same_key_concurrent", async () => {
    await reset();
    const results = await Promise.all([post("retry-concurrent-1"), post("retry-concurrent-1")]);
    const state = await readSandbox("/api/sandbox/reservations");
    const emails = await readSandbox("/api/sandbox/emails");
    assert(results.every((item) => item.response.ok), `concurrent POST statuses were ${results.map((item) => item.response.status).join(", ")}`);
    const ids = results.map((item) => item.body?.reservation?.id);
    assert(ids[0] && ids[0] === ids[1], "concurrent retries returned different reservation ids");
    assert(state.reservations.length === 1, `expected 1 reservation, found ${state.reservations.length}`);
    assert(emails.emails.length === 1, `expected 1 confirmation email, found ${emails.emails.length}`);
  });

  await check("different_keys_are_distinct", async () => {
    await reset();
    const first = await post("genuine-booking-1");
    const second = await post("genuine-booking-2");
    const state = await readSandbox("/api/sandbox/reservations");
    const emails = await readSandbox("/api/sandbox/emails");
    assert(first.response.ok && second.response.ok, `POST statuses were ${first.response.status}, ${second.response.status}`);
    assert(first.body?.reservation?.id && second.body?.reservation?.id && first.body.reservation.id !== second.body.reservation.id, "different keys did not create distinct reservations");
    assert(state.reservations.length === 2, `expected 2 reservations, found ${state.reservations.length}`);
    assert(emails.emails.length === 2, `expected 2 confirmation emails, found ${emails.emails.length}`);
  });

  await check("same_key_different_accounts_are_isolated", async () => {
    await reset();
    const first = await post("cross-account-isolation", { ...reservation, account: "A-1001" });
    const second = await post("cross-account-isolation", { ...reservation, account: "A-1003" });
    const firstAccount = await readSandbox("/api/sandbox/reservations");
    const secondAccount = await request("/api/sandbox/reservations?account=A-1003");
    assert(first.response.ok && second.response.ok, `POST statuses were ${first.response.status}, ${second.response.status}`);
    assert(first.body?.reservation?.id && second.body?.reservation?.id && first.body.reservation.id !== second.body.reservation.id, "same key across accounts reused a reservation");
    assert(firstAccount.reservations.length === 1 && firstAccount.reservations[0].account === "A-1001", "first account reservation was not isolated");
    assert(secondAccount.response.ok && secondAccount.body?.reservations?.length === 1 && secondAccount.body.reservations[0].account === "A-1003", "second account reservation was not isolated");
  });

  await check("missing_keys_remain_distinct", async () => {
    await reset();
    const first = await post("");
    const second = await post("");
    const state = await readSandbox("/api/sandbox/reservations");
    const emails = await readSandbox("/api/sandbox/emails");
    assert(first.response.ok && second.response.ok, `POST statuses were ${first.response.status}, ${second.response.status}`);
    assert(first.body?.reservation?.id && second.body?.reservation?.id && first.body.reservation.id !== second.body.reservation.id, "requests without keys were incorrectly deduplicated");
    assert(state.reservations.length === 2 && emails.emails.length === 2, `expected 2 reservations and emails, found ${state.reservations.length} and ${emails.emails.length}`);
  });

  const result = { ok: checks.every((item) => item.passed), checks };
  console.log(`PATCH_REGRESSION_RESULT=${JSON.stringify(result)}`);
  if (!result.ok) process.exitCode = 1;
}
