import { authorize, json } from "@/lib/auth";
import { createRun, listRuns, appendEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  let runs = await listRuns();
  if (who.kind === "worker") runs = runs.filter((r) => r.workspace === who.workspace);
  return json({ runs });
}

export async function POST(req) {
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  let body = {};
  try { body = await req.json(); } catch {}

  if (who.kind === "user") {
    // People can only start the simulated replay. Real runs come from the agent runtime.
    if (who.role !== "approver") return json({ error: "Viewers cannot start runs." }, 403);
    if (!body.simulated) return json({ error: "Real runs are created by the agent runtime with an ingest token." }, 400);
    const run = await createRun({ title: "Simulated replay: double booking", workspace: "demo", simulated: true, createdBy: who.name });
    return json({ run }, 201);
  }

  const run = await createRun({ title: body.title, workspace: who.workspace, simulated: false, createdBy: `worker:${who.workspace}` });
  if (body.instruction) {
    await appendEvents(run.id, [{ kind: "system", from: "system", type: "RUN_STARTED", ts: new Date().toISOString(), body: String(body.instruction).slice(0, 2000) }]);
  }
  return json({ run }, 201);
}
