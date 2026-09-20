// Append-only event log per run. Redis in production, process memory in local dev.
// seq is the 1-based position in the list, so ordering is decided atomically by RPUSH.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const storeKind = redis ? "redis" : "memory";

const g = globalThis;
if (!g.__reproMem) g.__reproMem = { runs: new Map(), events: new Map() };
const mem = g.__reproMem;

const K = {
  runs: "repro:runs",
  meta: (id) => `repro:run:${id}:meta`,
  events: (id) => `repro:run:${id}:events`,
};

function parse(v) {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

export function newRunId() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${stamp}-${rand}`;
}

export async function createRun({ id, title, workspace, simulated = false, createdBy }) {
  const meta = {
    id: id || newRunId(),
    title: String(title || "Untitled investigation").slice(0, 160),
    workspace: String(workspace || "default").slice(0, 60),
    simulated: !!simulated,
    createdBy: createdBy || "unknown",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "S0",
    status: "running",
    eventCount: 0,
  };
  if (redis) {
    await redis.set(K.meta(meta.id), JSON.stringify(meta));
    await redis.zadd(K.runs, { score: Date.now(), member: meta.id });
  } else {
    mem.runs.set(meta.id, meta);
    mem.events.set(meta.id, []);
  }
  return meta;
}

export async function getRun(id) {
  if (redis) return parse(await redis.get(K.meta(id)));
  return mem.runs.get(id) || null;
}

export async function listRuns(limit = 50) {
  if (redis) {
    const ids = await redis.zrange(K.runs, 0, limit - 1, { rev: true });
    if (!ids.length) return [];
    const metas = await redis.mget(...ids.map((i) => K.meta(i)));
    return metas.map(parse).filter(Boolean);
  }
  return [...mem.runs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

export async function patchRun(id, patch) {
  const meta = await getRun(id);
  if (!meta) return null;
  const next = { ...meta, ...patch, updatedAt: new Date().toISOString() };
  if (redis) await redis.set(K.meta(id), JSON.stringify(next));
  else mem.runs.set(id, next);
  return next;
}

/** Appends events in order. Returns the seq of the last one. */
export async function appendEvents(id, events) {
  if (!events.length) return 0;
  let last;
  if (redis) {
    last = await redis.rpush(K.events(id), ...events.map((e) => JSON.stringify(e)));
  } else {
    const list = mem.events.get(id) || [];
    list.push(...events);
    mem.events.set(id, list);
    last = list.length;
  }
  const patch = { eventCount: last };
  for (const e of events) {
    if (e.kind === "stage" && e.data && e.data.stage) patch.stage = e.data.stage;
    if (e.kind === "system" && e.type === "RUN_STARTED") patch.status = "running";
    if (e.kind === "system" && e.type === "RUN_FINISHED") patch.status = "finished";
    if (e.kind === "system" && e.type === "RUN_BLOCKED") patch.status = "blocked";
    if (e.kind === "system" && e.type === "RUN_CANCELLED") patch.status = "cancelled";
  }
  await patchRun(id, patch);
  return last;
}

/** Small key/value settings, e.g. the agent model selection. */
export async function readSetting(name) {
  const key = `repro:setting:${name}`;
  if (redis) return parse(await redis.get(key));
  if (!g.__reproSettings) g.__reproSettings = new Map();
  return g.__reproSettings.get(name) || null;
}

export async function writeSetting(name, value) {
  const key = `repro:setting:${name}`;
  if (redis) await redis.set(key, JSON.stringify(value));
  else {
    if (!g.__reproSettings) g.__reproSettings = new Map();
    g.__reproSettings.set(name, value);
  }
  return value;
}

/** Events with seq > after. */
export async function readEvents(id, after = 0, max = 500) {
  const start = Math.max(0, Number(after) || 0);
  let rows;
  if (redis) rows = await redis.lrange(K.events(id), start, start + max - 1);
  else rows = (mem.events.get(id) || []).slice(start, start + max);
  return rows.map(parse).filter(Boolean).map((e, i) => ({ ...e, seq: start + i + 1 }));
}
