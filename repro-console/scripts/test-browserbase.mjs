// Opt-in integration test: uses real Browserbase and model usage.
// The target is a static UI fixture intercepted inside the browser; no target server is contacted.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { loadRuntimeConfig } from "../worker/live/config.mjs";
import { openBrowserSession } from "../worker/live/browser.mjs";
import { runInvestigation } from "../worker/live/orchestrator.mjs";
import { startRuntimeServer } from "../worker/live/server.mjs";

const targetUrl = "https://patch-ui-fixture.test/";
const report = "The counter starts at 0. Clicking Add one once should show Count: 1, but I saw Count: 2. Click Add one exactly once, compare the displayed count with 1, and report whether this UI issue occurs. Do not reload, reset, or click a second time.";
const config = await loadRuntimeConfig();
assert.equal(config.browserbase.configured, true, "Configure BROWSERBASE_API_KEY in .env.local");
assert.deepEqual(config.missing, [], `Runtime configuration missing: ${config.missing.join(", ")}`);
// This test cannot invoke source editing, network fault injection, or arbitrary targets.
config.repoConfigured = false;
config.limits = { ...config.limits, actions: 5, runMs: 240000 };
const auth = { authorization: `Bearer ${config.ingestToken}`, "content-type": "application/json" };

function fixture(increment) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Counter UI test</title>
  <style>body{font:24px system-ui;padding:60px;background:#faf8ef}button{font:inherit;padding:16px}output{display:block;margin:30px 0}</style>
  <h1>Counter</h1><p>Add one should increase the displayed count by one.</p>
  <output id="count" aria-live="polite">Count: 0</output><button id="add">Add one</button>
  <script>let count=0;document.querySelector('#add').onclick=()=>{count+=${increment};document.querySelector('#count').textContent='Count: '+count};</script></html>`;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `HTTP ${response.status} from ${new URL(url).pathname}`);
  return response.json();
}

async function streamEvents(runId, collected, signal) {
  let cursor = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(`${config.consoleUrl}/api/runs/${runId}/stream?after=${cursor}`, { headers: auth, signal });
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = block.split("\n").find((row) => row.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6));
            cursor = event.seq;
            collected.push(event);
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) { if (!signal.aborted) throw error; }
  }
}

async function testCase(label, increment, expected) {
  const { run } = await apiJson(`${config.consoleUrl}/api/runs`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ title: `Browserbase integration test: ${label} counter`, instruction: "Controlled UI fixture; real browser and models; source editing disabled." }),
  });
  console.log(`Investigation: ${config.consoleUrl}/runs/${run.id}`);
  const received = [];
  const streamController = new AbortController();
  let streamError;
  const streaming = streamEvents(run.id, received, streamController.signal).catch((error) => { streamError = error; });
  let resolveResult, rejectResult, sessionId;
  const resultPromise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  // Attach rejection handling immediately, including failures before the queue request returns.
  resultPromise.catch(() => {});
  const runtime = await startRuntimeServer({
    config, port: 0,
    runTask: async (job) => {
      const timer = setTimeout(() => job.controller.abort(), 300000);
      const publish = job.publish;
      job.publish = async (events) => {
        for (const event of events) {
          if (event.kind === "stage") console.log(`${label}: stage ${event.data.stage}`);
          if (event.kind === "activity" && ["thinking", "acting", "blocked"].includes(event.data.status)) console.log(`${label}: ${event.from}: ${event.data.summary}`);
        }
        return publish(events);
      };
      try {
        resolveResult(await runInvestigation(job, {
          openSession: async (...args) => {
            const session = await openBrowserSession(...args);
            sessionId = session.sessionId;
            console.log(`Replay: https://www.browserbase.com/sessions/${sessionId}`);
            try {
              // The last registered route runs first. Fulfill only the fixed fixture origin.
              await session.context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(targetUrl).origin
                ? route.fulfill({ status: 200, contentType: "text/html", body: fixture(increment) })
                : route.abort());
              const act = session.act.bind(session);
              session.act = (action, handles) => {
                if (!["click", "wait"].includes(action.action)) throw new Error("The counter integration test only permits click and wait actions.");
                return act(action, handles);
              };
              return session;
            } catch (error) { await session.close(); throw error; }
          },
        }));
      } catch (error) { rejectResult(error); throw error; }
      finally { clearTimeout(timer); }
    },
  });
  try {
    const queued = await apiJson(`http://127.0.0.1:${runtime.address.port}/runs`, {
      method: "POST", headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, targetUrl, report, provider: "browserbase" }),
    });
    assert.equal(queued.accepted, true);
    const result = await resultPromise;
    console.log(`${label}: ${result.outcome}: ${result.summary}`);
    // Wait for delivery through the same stream consumed by the investigation room.
    const deadline = Date.now() + 15000;
    while (!received.some((event) => ["RUN_FINISHED", "RUN_BLOCKED", "RUN_CANCELLED"].includes(event.type)) && Date.now() < deadline && !streamError) await delay(200);
    if (streamError) throw streamError;
    assert.ok(received.some((event) => event.type === result.packet.terminal), "Terminal event reached the dashboard stream");
    assert.equal(result.blocked, false, result.summary);
    assert.equal(result.outcome, expected, result.summary);
    assert.ok(received.some((event) => event.kind === "browser" && event.data.live_url), "Live-view URL reached the dashboard");
    assert.ok(received.some((event) => event.kind === "browser" && event.data.status === "closed"), "Session closure reached the dashboard");
    assert.ok(result.packet.screenshots.length >= 2, "Before/after screenshots captured");
    assert.equal(result.packet.experiment.observed.filter((step) => step.action.startsWith("click ") && step.completed).length, 1, "Exactly one successful click");
    assert.match(result.packet.observations[0].body, /Count: 0/);
    assert.match(result.packet.observations.at(-1).body, new RegExp(`Count: ${increment}\\b`));
    assert.ok(result.packet.experiment.reviewEvidence.length > 0, "Conclusion cites observed evidence");
    assert.equal(result.packet.fix, null);
    assert.equal(result.packet.experiment.networkFault, null);
    const packet = await apiJson(`${config.consoleUrl}/api/runs/${run.id}/artifacts/reproduction-packet.json`, { headers: auth });
    assert.equal(packet.outcome, expected, "Artifact is downloadable through the console");
    const image = await fetch(`${config.consoleUrl}${packet.screenshots.at(-1).url}`, { headers: auth, signal: AbortSignal.timeout(60000) });
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /^image\/jpeg/);
    assert.ok((await image.arrayBuffer()).byteLength > 1000);
    const { events, run: saved } = await apiJson(`${config.consoleUrl}/api/runs/${run.id}/events`, { headers: auth });
    assert.equal(saved.status, "finished");
    assert.equal(events.filter((event) => ["REJECTED", "RUN_DISPATCH_UNKNOWN"].includes(event.type)).length, 0);
    const session = await apiJson(`${config.browserbase.apiUrl}/sessions/${sessionId}`, { headers: { "X-BB-API-Key": config.browserbase.apiKey } });
    assert.equal(session.status, "COMPLETED", "Cloud session released");
    console.log(`PASS ${label}: ${events.length} events, ${packet.screenshots.length} screenshots, ${expected}, session completed.`);
  } finally {
    streamController.abort();
    await streaming;
    await runtime.close();
  }
}

await testCase("broken", 2, "reproduced");
await testCase("working", 1, "not_reproduced");
