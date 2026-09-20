import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startRuntimeServer } from "../worker/live/server.mjs";
import { configForTest } from "../worker/live/config.mjs";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

async function until(predicate, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("condition was not reached before timeout");
}

test("runtime enforces auth, publishes queued cancellation, and rejects artifact traversal", async () => {
  const events = [];
  const ingest = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    events.push(...body.events);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ cursor: events.length }));
  });
  const ingestPort = await listen(ingest);
  const config = configForTest({ port: 0, consoleUrl: `http://127.0.0.1:${ingestPort}`, ingestToken: "ingest-test" });
  const started = [];
  const runtime = await startRuntimeServer({
    config,
    runTask: async (run) => {
      started.push(run.id);
      if (run.id === "run-blocker") await new Promise((resolve) => run.controller.signal.addEventListener("abort", resolve, { once: true }));
    },
  });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const auth = { authorization: "Bearer test-runtime-token", "content-type": "application/json" };
  try {
    const unauthorized = await fetch(`${base}/health`);
    assert.equal(unauthorized.status, 401);

    const first = await fetch(`${base}/runs`, { method: "POST", headers: auth, body: JSON.stringify({ runId: "run-blocker", targetUrl: "http://127.0.0.1:3100", report: "hold the first run", provider: "local" }) });
    assert.equal(first.status, 202);
    await until(() => started.includes("run-blocker"));
    const second = await fetch(`${base}/runs`, { method: "POST", headers: auth, body: JSON.stringify({ runId: "run-queued", targetUrl: "http://127.0.0.1:3100", report: "queued run", provider: "local" }) });
    assert.equal(second.status, 202);
    assert.equal((await second.json()).status, "queued");

    const stop = await fetch(`${base}/runs/run-queued/control`, { method: "POST", headers: auth, body: JSON.stringify({ action: "stop" }) });
    assert.equal(stop.status, 202);
    await until(() => events.some((event) => event.type === "RUN_CANCELLED"));
    assert.equal(events.find((event) => event.type === "RUN_CANCELLED").body, "Investigation stopped before browser work began.");

    const traversal = await fetch(`${base}/runs/run-queued/artifacts/patch.diff%2F..%2Fsecret`, { headers: { authorization: auth.authorization } });
    assert.equal(traversal.status, 404);
  } finally {
    await runtime.close();
    await new Promise((resolve) => ingest.close(resolve));
  }
});
