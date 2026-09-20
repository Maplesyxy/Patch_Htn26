import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessRun,
  isApprover,
  isSameOriginMutation,
  safeArtifactName,
  safeRunId,
  safeRuntimeHealth,
  validateInvestigationInput,
} from "../lib/live-runtime.js";
import { validateWorkerEvent } from "../lib/validate.js";
import { reduceEvents } from "../lib/reduce.js";

test("activity events accept canonical agents and clamp display fields", () => {
  const result = validateWorkerEvent({
    kind: "activity",
    from: "qa-engineer",
    data: {
      status: "observing",
      summary: "x".repeat(600),
      observation: "y".repeat(7000),
      step: 3,
      model: "z".repeat(120),
      phase: "S2",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.data.summary.length, 500);
  assert.equal(result.event.data.observation.length, 6000);
  assert.equal(result.event.data.model.length, 100);
  assert.equal(result.event.data.step, 3);
  assert.equal(validateWorkerEvent({ kind: "activity", from: "customer", data: { status: "acting", phase: "S0", step: 1 } }).ok, false);
  assert.match(validateWorkerEvent({ kind: "activity", from: "qa-engineer", data: { status: "working", phase: "S2", step: 1 } }).reason, /activity status/);
  assert.match(validateWorkerEvent({ kind: "activity", from: "qa-engineer", data: { status: "acting", phase: "S6", step: 1 } }).reason, /activity phase/);
});

test("browser progress includes safe relative screenshots and useful page details", () => {
  const valid = validateWorkerEvent({
    kind: "browser",
    from: "qa-engineer",
    data: {
      session_id: "session-1",
      current_url: "http://127.0.0.1:3100/bookings",
      title: "Booking page",
      screenshot_url: "/api/runs/run-20260920-ab12cd/artifacts/step-01.png",
      step: 1,
      action: "Click Reserve",
      live_url: "https://example.browserbase.com/live/abc",
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.event.data.screenshot_url, "/api/runs/run-20260920-ab12cd/artifacts/step-01.png");
  assert.equal(valid.event.data.current_url, "http://127.0.0.1:3100/bookings");
  assert.equal(valid.event.data.live_url, "https://example.browserbase.com/live/abc");
  const hostile = validateWorkerEvent({
    kind: "browser",
    from: "qa-engineer",
    data: { session_id: "session-1", screenshot_url: "https://evil.test/a.png", live_url: "https://user:pass@example.browserbase.com/live" },
  });
  assert.equal(hostile.event.data.screenshot_url, undefined);
  assert.equal(hostile.event.data.live_url, undefined);
  const traversal = validateWorkerEvent({ kind: "browser", from: "qa-engineer", data: { session_id: "s", screenshot_url: "/api/runs/run-20260920-ab12cd/artifacts/../../secret" } });
  assert.equal(traversal.event.data.screenshot_url, undefined);
});

test("structured system outcomes describe reproduction separately from execution state", () => {
  const checked = validateWorkerEvent({ kind: "system", type: "RUN_FINISHED", body: "Done", data: { outcome: "reproduced", summary: "The booking duplicated." } });
  assert.equal(checked.event.data.outcome, "reproduced");
  assert.equal(checked.event.data.summary, "The booking duplicated.");
  assert.equal(validateWorkerEvent({ kind: "system", type: "RUN_FINISHED", data: { outcome: "verified" } }).event.data, undefined);
  const finished = reduceEvents([{ ...checked.event, seq: 1 }]);
  assert.equal(finished.status, "finished");
  assert.equal(finished.finished, true);
  const blocked = reduceEvents([{ kind: "system", from: "system", type: "RUN_BLOCKED", seq: 1 }]);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.finished, false);
  const cancelled = reduceEvents([{ kind: "system", from: "system", type: "RUN_CANCELLED", seq: 1 }]);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelled, true);
});

test("agent activity history is bounded to the most recent 20 updates", () => {
  const events = Array.from({ length: 25 }, (_, i) => ({
    kind: "activity",
    from: "qa-engineer",
    seq: i + 1,
    data: { status: i === 24 ? "done" : "acting", summary: `step ${i}`, observation: "", step: i, model: "test", phase: "S2" },
  }));
  const state = reduceEvents(events);
  assert.equal(state.agents["qa-engineer"].activityHistory.length, 20);
  assert.equal(state.agents["qa-engineer"].activity.summary, "step 24");
  assert.equal(state.agents["qa-engineer"].busy, false);
});

test("live investigation input validates target, report, provider, and bounds the brief", () => {
  const valid = validateInvestigationInput({
    targetUrl: "http://127.0.0.1:3100/bookings",
    report: "I expected one reservation but two bookings appeared after clicking Reserve.",
    provider: "local",
    brief: { title: "Duplicate booking for casey@example.com", steps: ["Click Reserve"] },
  });
  assert.equal(valid.error, undefined);
  assert.match(valid.value.brief.title, /\[email\]/);
  assert.equal(valid.value.provider, "local");
  assert.equal(validateInvestigationInput({ ...valid.value, brief: {} }).value.brief.title, "I expected one reservation but two bookings appeared after clicking Reserve.");
  assert.match(validateInvestigationInput({ ...valid.value, targetUrl: "javascript:alert(1)" }).error, /HTTP or HTTPS/);
  assert.match(validateInvestigationInput({ ...valid.value, targetUrl: "https://user:password@example.com" }).error, /username or password/);
  assert.match(validateInvestigationInput({ ...valid.value, report: "short" }).error, /between 20 and 8000/);
  assert.match(validateInvestigationInput({ ...valid.value, provider: "remote" }).error, /Choose Browserbase or local/);
  assert.match(validateInvestigationInput({
    ...valid.value,
    brief: { summary: "s".repeat(1200), steps: Array(12).fill("x".repeat(240)), unknowns: Array(12).fill("y".repeat(240)) },
  }).error, /brief is too long/);
});

test("runtime readiness exposes only the safe health contract", () => {
  const health = safeRuntimeHealth({
    ready: true,
    providers: { browserbase: { configured: true, apiKey: "secret" }, local: { configured: false } },
    models: { execution: "model-a", supervisor: "model-b", incidents: "model-c", apiKey: "secret" },
    missing: ["BROWSERBASE_API_KEY"],
    repoConfigured: false,
    token: "secret",
  });
  assert.deepEqual(health, {
    available: true,
    ready: true,
    providers: { browserbase: { configured: true }, local: { configured: false } },
    models: { execution: "model-a", supervisor: "model-b", incidents: "model-c" },
    missing: ["BROWSERBASE_API_KEY"],
    repoConfigured: false,
  });
  assert.equal(safeRuntimeHealth(null), null);
});

test("approver, workspace, same-origin, and path guards match live API boundaries", () => {
  const approver = { kind: "user", role: "approver" };
  const viewer = { kind: "user", role: "viewer" };
  const worker = { kind: "worker", workspace: "acme" };
  const run = { simulated: false, workspace: "acme" };
  assert.equal(isApprover(approver), true);
  assert.equal(isApprover(viewer), false);
  assert.equal(isApprover(worker), false);
  assert.equal(canAccessRun(viewer, run), true);
  assert.equal(canAccessRun(worker, run), true);
  assert.equal(canAccessRun({ kind: "worker", workspace: "other" }, run), false);
  assert.equal(canAccessRun(approver, { ...run, simulated: true }), false);
  assert.equal(isSameOriginMutation(new Request("https://patch.test/api/investigations", { headers: { origin: "https://patch.test" } })), true);
  assert.equal(isSameOriginMutation(new Request("https://patch.test/api/investigations", { headers: { origin: "https://evil.test" } })), false);
  assert.equal(isSameOriginMutation(new Request("https://patch.test/api/investigations")), true);
  assert.equal(safeRunId("run-20260920-ab12cd"), true);
  assert.equal(safeRunId("../secret"), false);
  assert.equal(safeArtifactName("screenshot-1.png"), true);
  assert.equal(safeArtifactName("../secret"), false);
});
