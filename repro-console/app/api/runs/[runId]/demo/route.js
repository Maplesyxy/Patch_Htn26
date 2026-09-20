import { authorize, json } from "@/lib/auth";
import { getRun, appendEvents, patchRun } from "@/lib/store";
import { validateWorkerEvent } from "@/lib/validate";
import { DEMO_TRACE } from "@/lib/demoTrace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Appends one fixture step to a simulated run. The browser paces the calls.
export async function POST(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who || who.kind !== "user" || who.role !== "approver") return json({ error: "Approvers only." }, 403);
  const run = await getRun(runId);
  if (!run || !run.simulated) return json({ error: "Not a simulated run." }, 400);
  let body = {};
  try { body = await req.json(); } catch {}
  const index = Number(body.index);
  const expected = run.demoIndex || 0;
  if (index !== expected) return json({ done: expected >= DEMO_TRACE.length, skipped: true, index: expected, nextDelay: 800 });
  const step = DEMO_TRACE[index];
  if (!step) return json({ done: true });
  await patchRun(runId, { demoIndex: index + 1 }); // claim the step first so two open tabs do not double-post
  const v = validateWorkerEvent(step.event); // the fixture obeys the same bus rules as real agents
  if (!v.ok) return json({ error: `Fixture step ${index} invalid: ${v.reason}` }, 500);
  await appendEvents(runId, [v.event]);
  const next = DEMO_TRACE[index + 1];
  return json({ done: !next, index: index + 1, nextDelay: next ? next.delay : 0 });
}
