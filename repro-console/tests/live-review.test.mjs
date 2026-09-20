import assert from "node:assert/strict";
import test from "node:test";
import { liveReviewDetails } from "../lib/live-review.js";

test("review artifacts only appear when patch or verdict records reference them", () => {
  const activityOnly = liveReviewDetails([
    { kind: "activity", from: "software-engineer", data: { phase: "S3", summary: "Reproducing the failure" } },
    { kind: "activity", from: "release-verifier", data: { phase: "S4", summary: "Checking the base" } },
  ]);
  assert.deepEqual(activityOnly.artifacts, []);
  assert.equal(activityOnly.branch, null);
  assert.equal(activityOnly.verdictResult, null);

  const withPatch = liveReviewDetails([
    { kind: "ledger", from: "software-engineer", seq: 1, data: { record: "patch", id: "PATCH-run-1", value: {
      branch: "fix/booking-idempotency", validation_scope: "localmemory", artifacts: ["patch.diff", "verification.md", "verification.json", "not-linked.txt"],
    } } },
  ]);
  assert.deepEqual(withPatch.artifacts, ["patch.diff", "verification.md", "verification.json"]);
  assert.equal(withPatch.branch, "fix/booking-idempotency");
  assert.equal(withPatch.scope, "localmemory");
  assert.equal(withPatch.verdictResult, null);

  const withVerdict = liveReviewDetails([
    { kind: "ledger", from: "software-engineer", seq: 1, data: { record: "patch", id: "PATCH-run-1", value: { branch: "fix/booking-idempotency", validation_scope: "localmemory", artifacts: ["patch.diff"] } } },
    { kind: "ledger", from: "release-verifier", seq: 2, data: { record: "verdict", id: "VER-run-1", value: { result: "verified", validation_scope: "localmemory", evidence: ["verification.md", "verification.json"] } } },
  ]);
  assert.deepEqual(withVerdict.artifacts, ["patch.diff", "verification.md", "verification.json"]);
  assert.equal(withVerdict.verdictResult, "verified");
});
