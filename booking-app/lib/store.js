// Shared state for the sandbox. Redis in production, process memory in local dev.
//
// Redis is not optional on Vercel: a retried booking is two HTTP requests, and on
// serverless they can land on different instances. With per-instance memory the
// second reservation would be invisible to /api/sandbox/reservations and the
// defect would look like it had been fixed.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const storeKind = redis ? "redis" : "memory";

const g = globalThis;
if (!g.__bookingMem) g.__bookingMem = { reservations: [], requests: [], emails: [], feedback: [], counter: 0 };
const mem = g.__bookingMem;

const K = {
  reservations: "booking:reservations",
  requests: "booking:requests",
  emails: "booking:emails",
  feedback: "booking:feedback",
  counter: "booking:counter",
};

const MAX_LOG = 500;

function parse(v) {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

async function push(key, memKey, row, cap) {
  if (redis) {
    await redis.rpush(key, JSON.stringify(row));
    if (cap) await redis.ltrim(key, -cap, -1);
  } else {
    mem[memKey].push(row);
    if (cap && mem[memKey].length > cap) mem[memKey].splice(0, mem[memKey].length - cap);
  }
}

async function readAll(key, memKey) {
  if (redis) return (await redis.lrange(key, 0, -1)).map(parse).filter(Boolean);
  return [...mem[memKey]];
}

/** Monotonic reservation number. INCR is atomic, so a retry cannot collide with the first write. */
export async function nextReservationNumber() {
  if (redis) return await redis.incr(K.counter);
  return ++mem.counter;
}

export async function addReservation(row) { await push(K.reservations, "reservations", row); }
export async function listReservations(account) {
  const rows = await readAll(K.reservations, "reservations");
  return account ? rows.filter((r) => r.account === account) : rows;
}

export async function addRequest(row) { await push(K.requests, "requests", row, MAX_LOG); }
export async function listRequests({ account, path, limit = 200 } = {}) {
  let rows = await readAll(K.requests, "requests");
  if (account) rows = rows.filter((r) => r.account === account);
  if (path) rows = rows.filter((r) => r.path === path);
  return rows.slice(-limit);
}

export async function addEmail(row) { await push(K.emails, "emails", row, MAX_LOG); }
export async function listEmails(account) {
  const rows = await readAll(K.emails, "emails");
  return account ? rows.filter((r) => r.account === account) : rows;
}

export async function addFeedback(row) { await push(K.feedback, "feedback", row, MAX_LOG); }
export async function listFeedback({ kind, since } = {}) {
  let rows = await readAll(K.feedback, "feedback");
  if (kind) rows = rows.filter((r) => r.kind === kind);
  if (since) rows = rows.filter((r) => r.created_at > since);
  return rows;
}

export async function wipe({ keepFeedback = false } = {}) {
  // Feedback survives a reset by default: a judge's bug report should not vanish the
  // next time QA resets the sandbox mid-run.
  const keys = [K.reservations, K.requests, K.emails, K.counter];
  if (!keepFeedback) keys.push(K.feedback);
  if (redis) await redis.del(...keys);
  else {
    mem.reservations = []; mem.requests = []; mem.emails = []; mem.counter = 0;
    if (!keepFeedback) mem.feedback = [];
  }
}

export async function setCounter(n) {
  if (redis) await redis.set(K.counter, n);
  else mem.counter = n;
}
