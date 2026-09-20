import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadRuntimeConfig, validateTargetUrl } from "./config.mjs";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
const ARTIFACT = /^(?:frame-\d{4}(?:-\d+)?\.jpg|reproduction-packet\.(?:json|md)|patch\.diff|verification\.(?:json|md))$/;
const BODY_MAX = 32 * 1024;

export async function startRuntimeServer({ config, runTask, logger = console, port } = {}) {
  config ||= await loadRuntimeConfig();
  const runs = new Map();
  const queue = [];
  let active = null;

  async function launchNext() {
    if (active || !queue.length) return;
    const run = queue.shift();
    if (run.controller.signal.aborted) { run.status = "cancelled"; return launchNext(); }
    active = run;
    run.status = "running";
    run.startedAt = new Date().toISOString();
    try {
      await run.publish([{ kind: "system", from: "system", type: "RUN_STARTED", body: "Browser investigation started." }]);
      if (runTask) await runTask(run);
      else {
        const mod = await import("./orchestrator.mjs");
        await mod.runInvestigation(run);
      }
      if (!run.controller.signal.aborted) run.status = "finished";
    } catch (error) {
      run.error = safeError(error);
      run.status = run.controller.signal.aborted ? "cancelled" : "failed";
      logger.error?.(`[patch-runtime] ${run.id} ${run.status}: ${run.error}`);
      if (!run.finalEventEmitted) {
        await run.publish([{ kind: "system", from: "system", type: run.controller.signal.aborted ? "RUN_CANCELLED" : "RUN_BLOCKED", body: run.controller.signal.aborted ? "Investigation stopped by the user." : `Investigation blocked by a runtime error: ${run.error}` }]);
      }
    } finally {
      run.finishedAt = new Date().toISOString();
      active = null;
      void launchNext();
    }
  }

  async function handler(req, res) {
    const origin = req.headers.origin;
    applyCors(req, res, origin);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (!authorized(req, config.token)) { sendJson(res, 401, { error: "Unauthorized." }); return; }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ready: config.missing.length === 0,
        providers: { browserbase: { configured: config.browserbase.configured }, local: { configured: config.local.configured } },
        models: config.models,
        missing: config.missing,
        repoConfigured: config.repoConfigured,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/runs") {
      let body;
      try { body = await readJsonBody(req); } catch (error) { sendJson(res, error.status || 400, { error: error.message }); return; }
      const { runId, targetUrl, report, brief = "", provider = "browserbase" } = body || {};
      if (!RUN_ID.test(String(runId || ""))) { sendJson(res, 400, { error: "runId is invalid." }); return; }
      if (runs.has(runId)) { sendJson(res, 409, { error: "A runtime is already registered for this run." }); return; }
      if (typeof report !== "string" || !report.trim() || report.length > 8000) { sendJson(res, 400, { error: "Report must contain 1 to 8000 characters." }); return; }
      let boundedBrief = "";
      if (brief && typeof brief !== "string" && (typeof brief !== "object" || Array.isArray(brief))) { sendJson(res, 400, { error: "Brief must be an object or text." }); return; }
      try {
        const briefJson = JSON.stringify(brief || "");
        if (briefJson.length > 8000) { sendJson(res, 400, { error: "Brief is too large." }); return; }
        boundedBrief = typeof brief === "string" ? brief : brief || "";
      } catch { sendJson(res, 400, { error: "Brief must be JSON data." }); return; }
      let target;
      try { target = validateTargetUrl(targetUrl); } catch (error) { sendJson(res, 400, { error: error.message }); return; }
      if (!/^(browserbase|local)$/.test(provider)) { sendJson(res, 400, { error: "Choose Browserbase or local Chromium." }); return; }
      if (provider === "browserbase" && !config.browserbase.configured) { sendJson(res, 503, { error: "Browserbase is not configured." }); return; }
      if (provider === "local" && !config.local.configured) { sendJson(res, 503, { error: "Local Chromium is not configured." }); return; }
      if (!config.ingestToken || !config.consoleUrl) { sendJson(res, 503, { error: "The runtime is missing console ingest configuration." }); return; }
      if (config.missing.length) { sendJson(res, 503, { error: "The live runtime is not ready.", missing: config.missing }); return; }
      if (queue.length >= config.limits.queued) { sendJson(res, 429, { error: "The bounded runtime queue is full." }); return; }
      const run = {
        id: String(runId), targetUrl: target.href, origin: target.origin, report: report.trim(),
        brief: boundedBrief, provider,
        controller: new AbortController(), status: "queued", createdAt: new Date().toISOString(),
        config, finalEventEmitted: false,
        publish: async (events) => {
          const result = await publishEvents(config, runId, events);
          if (result.ok && events.some((event) => event.kind === "system" && ["RUN_FINISHED", "RUN_CANCELLED", "RUN_BLOCKED"].includes(event.type))) run.finalEventEmitted = true;
          return result;
        },
      };
      runs.set(run.id, run);
      queue.push(run);
      void launchNext();
      sendJson(res, 202, { accepted: true, runId: run.id, status: run.status, queued: queue.length });
      return;
    }

    const control = url.pathname.match(/^\/runs\/([^/]+)\/control$/);
    if (req.method === "POST" && control) {
      const run = runs.get(decodeURIComponent(control[1]));
      if (!run) { sendJson(res, 404, { error: "No runtime is registered for that run." }); return; }
      let body;
      try { body = await readJsonBody(req); } catch (error) { sendJson(res, error.status || 400, { error: error.message }); return; }
      if (body?.action !== "stop") { sendJson(res, 400, { error: "Supported control action is stop." }); return; }
      if (["finished", "failed", "cancelled"].includes(run.status)) { sendJson(res, 200, { runId: run.id, status: run.status }); return; }
      run.controller.abort(new Error("Stopped by user."));
      if (run.status === "queued") {
        run.status = "cancelled";
        const i = queue.indexOf(run);
        if (i >= 0) queue.splice(i, 1);
        await run.publish([{ kind: "system", from: "system", type: "RUN_CANCELLED", body: "Investigation stopped before browser work began." }]);
      }
      sendJson(res, 202, { runId: run.id, status: run.status, stopping: run.status === "running" });
      return;
    }

    const artifact = url.pathname.match(/^\/runs\/([^/]+)\/artifacts\/([^/]+)$/);
    if (req.method === "GET" && artifact) {
      const id = decodeURIComponent(artifact[1]);
      const name = decodeURIComponent(artifact[2]);
      if (!RUN_ID.test(id) || !ARTIFACT.test(name)) { sendJson(res, 404, { error: "Artifact not found." }); return; }
      const file = path.resolve(config.dataDir, id, name);
      const boundary = `${path.resolve(config.dataDir)}${path.sep}`;
      if (!file.startsWith(boundary)) { sendJson(res, 404, { error: "Artifact not found." }); return; }
      try {
        const info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new Error("unsafe artifact");
        const bytes = await fs.readFile(file);
        res.writeHead(200, {
          "Content-Type": name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".json") ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
          "Content-Length": bytes.length,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        });
        res.end(bytes);
      } catch {
        sendJson(res, 404, { error: "Artifact not found." });
      }
      return;
    }
    sendJson(res, 404, { error: "No such runtime endpoint." });
  }

  const server = http.createServer((req, res) => { void handler(req, res).catch((error) => {
    logger.error?.(`[patch-runtime] ${safeError(error)}`);
    if (!res.headersSent) sendJson(res, 500, { error: "Runtime request failed." });
    else res.destroy();
  }); });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port ?? config.port, config.host, resolve);
  });
  return {
    server,
    config,
    runs,
    address: server.address(),
    close: () => new Promise((resolve, reject) => {
      for (const run of runs.values()) if (["queued", "running"].includes(run.status)) run.controller.abort();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function authorized(req, token) {
  if (!token) return false;
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") && value.slice(7) === token;
}

function applyCors(req, res, origin) {
  const allowed = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(res, status, body) {
  const out = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": out.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(out);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX) { const error = new Error("Request body is too large."); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Send valid JSON."); }
}

async function publishEvents(config, runId, events) {
  try {
    const response = await fetch(`${config.consoleUrl}/api/runs/${encodeURIComponent(runId)}/events`, {
      method: "POST", headers: { Authorization: `Bearer ${config.ingestToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events }), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.rejected?.length) return { ok: false, status: response.status, rejected: result.rejected || [] };
    return { ok: true, cursor: result.cursor };
  } catch (error) {
    return { ok: false, unknown: true, error: safeError(error) };
  }
}

function safeError(error) { return String(error?.message || error || "Unknown runtime error").replace(/https?:\/\/[^\s)]+/g, "[url]").slice(0, 300); }

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startRuntimeServer().then(({ address }) => {
    console.log(`[patch-runtime] listening on http://${address.address}:${address.port}`);
  }).catch((error) => {
    console.error(`[patch-runtime] startup failed: ${safeError(error)}`);
    process.exitCode = 1;
  });
}
