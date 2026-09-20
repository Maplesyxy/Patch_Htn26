import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  bookingTargetMatches,
  parseClaudeOutput,
  parseRegressionOutput,
  runBookingFix,
  validateClaudeEdits,
} from "../worker/live/booking-fix.mjs";

test("source adapter matches only the configured booking app origin", () => {
  assert.equal(bookingTargetMatches("http://127.0.0.1:3100/bookings", "http://127.0.0.1:3100"), true);
  assert.equal(bookingTargetMatches("https://booking.example.test/repro", "https://booking.example.test"), true);
  assert.equal(bookingTargetMatches("https://other.example.test", "https://booking.example.test"), false);
  assert.equal(bookingTargetMatches("http://127.0.0.1:3101", "http://127.0.0.1:3100"), false);
  assert.equal(bookingTargetMatches("https://user:pass@booking.example.test", "https://booking.example.test"), false);
  assert.equal(bookingTargetMatches("javascript:alert(1)", "https://booking.example.test"), false);
});

test("Claude structured edits accept only complete replacements in the exact source allowlist", () => {
  const valid = validateClaudeEdits({
    summary: "Persist idempotency records atomically before writing dependent rows.",
    edits: [{ path: "booking-app/lib/store.js", content: "export async function nextReservationNumber(){ return 1; }" }],
  });
  assert.equal(valid.edits[0].path, "booking-app/lib/store.js");
  assert.throws(() => validateClaudeEdits({ summary: "A plausible bounded fix summary.", edits: [{ path: "tests/protected/booking-regression.mjs", content: "export {};" }] }), /not allowed/);
  assert.throws(() => validateClaudeEdits({ summary: "A plausible bounded fix summary.", edits: [
    { path: "booking-app/lib/store.js", content: "export const value = 'replacement content one';" },
    { path: "booking-app/lib/store.js", content: "export const value = 'replacement content two';" },
  ] }), /repeats/);
  assert.throws(() => validateClaudeEdits({ summary: "A plausible bounded fix summary.", unsupported: true, edits: [{ path: "booking-app/lib/store.js", content: "export const x = 1;" }] }), /unsupported fields/);
});

test("protected regression result parser requires its explicit machine-readable marker", () => {
  const result = parseRegressionOutput("booting\nPATCH_REGRESSION_RESULT={\"ok\":false,\"checks\":[{\"name\":\"same_key_sequential\",\"passed\":false}]}\n");
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].name, "same_key_sequential");
  assert.throws(() => parseRegressionOutput("not a result"), /did not return/);
  assert.throws(() => parseRegressionOutput("PATCH_REGRESSION_RESULT=bad-json"), SyntaxError);
});

test("Claude CLI parser prefers the structured output envelope and rejects CLI errors", () => {
  const payload = { summary: "Persist retries in the shared sandbox store.", edits: [
    { path: "booking-app/lib/store.js", content: "export const idempotencyStore = new Map(); // complete replacement body" },
  ] };
  const parsed = parseClaudeOutput(JSON.stringify({ type: "result", is_error: false, result: "not-json plaintext", structured_output: payload }));
  assert.equal(parsed.summary, payload.summary);
  assert.equal(parsed.edits[0].path, payload.edits[0].path);
  assert.throws(() => parseClaudeOutput(JSON.stringify({ type: "result", is_error: true, result: "failure" })), /implementation error/);
  assert.throws(() => parseClaudeOutput(JSON.stringify({ type: "result", is_error: false, result: "not-json plaintext" })), /not valid JSON/);
});

test("disabled fix adapter exits before touching source and writes a truthful blocked artifact", async () => {
  const original = process.env.PATCH_FIX_BOOKING_APP;
  delete process.env.PATCH_FIX_BOOKING_APP;
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "patch-booking-fix-test-"));
  try {
    const result = await runBookingFix({ runId: "run-20260920-abc123", targetUrl: "http://127.0.0.1:3100", report: "duplicate booking", runDir });
    assert.equal(result.status, "blocked");
    assert.equal(result.branch, null);
    assert.deepEqual(result.artifacts, ["patch.diff", "verification.json", "verification.md"]);
    const verification = JSON.parse(await fs.readFile(path.join(runDir, "verification.json"), "utf8"));
    assert.equal(verification.status, "blocked");
    assert.match(verification.summary, /not enabled/);
    assert.equal((await fs.readFile(path.join(runDir, "patch.diff"), "utf8")), "");
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
    if (original !== undefined) process.env.PATCH_FIX_BOOKING_APP = original;
  }
});
