import test from "node:test";
import assert from "node:assert/strict";
import { BrowserSession, safeUrl, validateNetworkFaultRequest } from "../worker/live/browser.mjs";
import { configForTest, loadRuntimeConfig, validateTargetUrl } from "../worker/live/config.mjs";

test("runtime config binds the explicit ingest token to its selected workspace pair", async () => {
  const common = {
    PATCH_RUNTIME_TOKEN: "runtime-test",
    REPRO_INGEST_TOKENS: "alpha:ingest-a,beta:ingest-b",
    PATCH_RUNTIME_WORKSPACE: "beta",
    REPRO_INGEST_TOKEN: "ingest-b",
    GEMINI_API_KEY: "gemini-test",
    BROWSERBASE_API_KEY: "browserbase-test",
    BROWSERBASE_PROJECT_ID: "project-test",
    PATCH_CLAUDE_COMMAND: "claude",
  };
  const valid = await loadRuntimeConfig(common, { loadDotenv: false });
  assert.equal(valid.workspace, "beta");
  assert.equal(valid.ingestToken, "ingest-b");
  assert.equal(valid.browserbase.configured, true);

  const mismatch = await loadRuntimeConfig({ ...common, REPRO_INGEST_TOKEN: "ingest-a" }, { loadDotenv: false });
  assert.equal(mismatch.ingestToken, "ingest-a");
  assert.match(mismatch.missing.join(" "), /must match the same/);
});

test("target URL validation permits app query state but rejects credential fields", () => {
  assert.equal(validateTargetUrl("http://127.0.0.1:3100/book?account=A-1001").search, "?account=A-1001");
  for (const value of [
    "https://example.test/?token=secret",
    "https://example.test/?access_token=secret",
    "https://example.test/#auth=secret",
    "https://user:password@example.test/",
    "javascript:alert(1)",
  ]) assert.throws(() => validateTargetUrl(value));
});

test("browser URL telemetry drops query and fragment data and enforces the target origin", () => {
  assert.equal(safeUrl("http://127.0.0.1:3100/book?account=A-1001&token=secret#state=secret", "http://127.0.0.1:3100"), "http://127.0.0.1:3100/book");
  assert.equal(safeUrl("https://other.test/book", "http://127.0.0.1:3100"), undefined);
});

test("one-time fault requires an observed same-origin POST and can be cleared", async () => {
  const config = configForTest();
  const session = new BrowserSession({ browser: {}, context: {}, page: {}, provider: "local", sessionId: "test", targetUrl: "http://127.0.0.1:3100/book", report: "After one click, the connection drops the response and a retry creates duplicates.", config });
  session.observedUrls.set("N1", { id: "N1", url: "http://127.0.0.1:3100/bookings", pathname: "/bookings", method: "GET" });
  session.observedUrls.set("N2", { id: "N2", url: "http://127.0.0.1:3100/api/bookings", pathname: "/api/bookings", method: "POST" });
  assert.equal(validateNetworkFaultRequest(session, { mode: "drop_response", networkRequestId: "N1" }, session.report), false);
  assert.equal(validateNetworkFaultRequest(session, { mode: "drop_response", networkRequestId: "N2" }, session.report), true);
  await assert.rejects(session.act({ action: "network_fault", mode: "drop_response", networkRequestId: "N1" }, new Map()), /observed same-origin POST/);
  await session.act({ action: "network_fault", mode: "drop_response", networkRequestId: "N2" }, new Map());
  assert.equal(session.networkFault.pathname, "/api/bookings");
  assert.equal(session.networkFault.applied, false);
  await session.act({ action: "network_fault", mode: "none" }, new Map());
  assert.equal(session.networkFault, null);
});

test("fault interception records upstream completion separately from the request", async () => {
  const config = configForTest();
  let handler;
  const context = {
    route: async (_pattern, callback) => { handler = callback; },
    on() {},
  };
  const page = { on() {}, mainFrame() { return {}; } };
  const session = new BrowserSession({ browser: {}, context, page, provider: "local", sessionId: "test", targetUrl: "http://127.0.0.1:3100/book", report: "response loss retry", config });
  session.networkFault = { pathname: "/api/bookings", requestId: "N1", used: false, applied: false };
  await session.installGuards();
  const calls = [];
  await handler({
    request: () => ({ url: () => "http://127.0.0.1:3100/api/bookings?account=A-1001", resourceType: () => "xhr", method: () => "POST" }),
    fetch: async (options) => { calls.push(["fetch", options.maxRedirects, options.maxRetries]); return { status: () => 201 }; },
    abort: async (reason) => { calls.push(["abort", reason]); },
    continue: async () => calls.push(["continue"]),
  });
  assert.deepEqual(calls, [["fetch", 0, 0], ["abort", "connectionreset"]]);
  assert.equal(session.networkFault.used, true);
  assert.equal(session.networkFault.applied, true);
  assert.equal(session.networkFault.upstreamStatus, 201);

  calls.length = 0;
  await handler({
    request: () => ({ url: () => "http://127.0.0.1:3100/api/bookings", resourceType: () => "xhr", method: () => "POST" }),
    continue: async () => calls.push(["continue"]),
    abort: async (reason) => calls.push(["abort", reason]),
  });
  assert.deepEqual(calls, [["continue"]]);
});
