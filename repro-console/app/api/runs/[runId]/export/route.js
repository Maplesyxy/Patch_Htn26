import { authorize, json } from "@/lib/auth";
import { getRun, readEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full audit record of a run: metadata plus every event, rejection and human decision.
export async function GET(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  const run = await getRun(runId);
  if (!run) return json({ error: "No such run." }, 404);
  if (who.kind === "worker" && run.workspace !== who.workspace) return json({ error: "Run belongs to another workspace." }, 403);
  const events = [];
  for (;;) {
    const page = await readEvents(runId, events.length, 1000);
    events.push(...page);
    if (page.length < 1000) break;
  }
  const payload = { run, exportedAt: new Date().toISOString(), exportedBy: who.name || who.workspace, events };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${runId}-audit.json"`,
      "Cache-Control": "no-store",
    },
  });
}
