import test from "node:test";
import assert from "node:assert/strict";
import { claudeProcessError, createSupervisorPlan } from "../worker/live/models.mjs";

const config = { geminiApiKey: "test-only", models: { supervisor: "test-model" } };
const plan = { decision: "continue", hypothesis: "The counter displays two after one click.", plan: "Click once and inspect the counter.", allowNetworkFault: false, reason: "Controlled UI test." };
const success = () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] });

test("Gemini retries a temporary provider error once and returns the structured plan", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({}, { status: 503 }) : success());
  assert.deepEqual(await createSupervisorPlan(config, "UI test", new AbortController().signal), plan);
  assert.equal(calls, 2);
});

test("Gemini stops after its bounded retry and never retries rejected credentials", async (t) => {
  let calls = 0;
  let status = 503;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({}, { status }); });
  await assert.rejects(createSupervisorPlan(config, "UI test", new AbortController().signal), /HTTP 503/);
  assert.equal(calls, 2);
  status = 403;
  calls = 0;
  await assert.rejects(createSupervisorPlan(config, "UI test", new AbortController().signal), /credentials were rejected/);
  assert.equal(calls, 1);
});

test("cancelling a Gemini retry prevents another provider request", async (t) => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => { calls++; controller.abort(); return Response.json({}, { status: 503 }); });
  await assert.rejects(createSupervisorPlan(config, "UI test", controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("Claude expired authentication gets actionable feedback without exposing CLI output", () => {
  const error = claudeProcessError(JSON.stringify({ is_error: true, result: "Failed to authenticate: OAuth session expired and could not be refreshed; token=private-value" }), "", 1);
  assert.match(error.message, /claude auth login/);
  assert.doesNotMatch(error.message, /private-value/);
  assert.equal(error.retryable, false);
  const unknown = claudeProcessError("non-json output with a secret", "private diagnostic", 1);
  assert.equal(unknown.message, "Claude Code exited with status 1.");
});
