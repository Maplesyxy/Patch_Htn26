const REVIEW_ARTIFACTS = ["patch.diff", "verification.md", "verification.json"];

function mergeLedgerRecords(events, recordType) {
  const records = new Map();
  for (const event of events) {
    if (event.kind !== "ledger" || event.data?.record !== recordType || !event.data.id) continue;
    const previous = records.get(event.data.id) || {};
    const value = event.data.value && typeof event.data.value === "object" ? event.data.value : {};
    records.set(event.data.id, { ...previous, ...value, id: event.data.id, seq: event.seq || previous.seq || 0 });
  }
  return [...records.values()].sort((left, right) => left.seq - right.seq);
}

function referencedArtifactName(reference) {
  if (typeof reference !== "string") return "";
  const filename = reference.split(/[\\/]/).pop();
  return REVIEW_ARTIFACTS.includes(filename) ? filename : "";
}

export function liveReviewDetails(events = []) {
  const patches = mergeLedgerRecords(events, "patch");
  const verdicts = mergeLedgerRecords(events, "verdict");
  const referenced = new Set();
  for (const patch of patches) {
    for (const reference of Array.isArray(patch.artifacts) ? patch.artifacts : []) {
      const filename = referencedArtifactName(reference);
      if (filename) referenced.add(filename);
    }
  }
  for (const verdict of verdicts) {
    for (const reference of Array.isArray(verdict.evidence) ? verdict.evidence : []) {
      const filename = referencedArtifactName(reference);
      if (filename) referenced.add(filename);
    }
  }

  const patch = patches.at(-1) || null;
  const verdict = verdicts.at(-1) || null;
  return {
    patches,
    verdicts,
    artifacts: REVIEW_ARTIFACTS.filter((filename) => referenced.has(filename)),
    branch: patch?.branch || null,
    scope: patch?.validation_scope || verdict?.validation_scope || null,
    verdictResult: verdict?.result || null,
  };
}
