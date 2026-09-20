import { authorize, json } from "@/lib/auth";
import { getRun, appendEvents, readEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// People talk to the team here: new evidence / instructions, and approval decisions.
export async function POST(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to post." }, 401);
  if (who.role !== "approver") return json({ error: "Viewers can watch but not post or approve." }, 403);
  const run = await getRun(runId);
  if (!run) return json({ error: "No such run." }, 404);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const ts = new Date().toISOString();

  if (body.mode === "decision") {
    if (!["approved", "rejected"].includes(body.decision)) return json({ error: "Decision must be approved or rejected." }, 400);
    const events = await readEvents(runId, 0, 5000);
    const request = events.find((e) => e.kind === "approval" && e.data.id === body.approval);
    if (!request) return json({ error: "No such approval request." }, 404);
    if (events.some((e) => e.kind === "decision" && e.data.approval === body.approval)) {
      return json({ error: "Already decided." }, 409);
    }
    await appendEvents(runId, [{
      kind: "decision", from: "human", ts,
      data: { approval: String(body.approval), decision: body.decision, note: String(body.note || "").slice(0, 1000), actor: who.name },
    }]);
    return json({ ok: true });
  }

  const text = String(body.body || "").trim();
  if (!text) return json({ error: "Write something first." }, 400);
  await appendEvents(runId, [{
    kind: "message", from: "human", to: ["incident-lead"], type: "NEW_EVIDENCE", ts,
    refs: [], artifacts: [], body: text.slice(0, 4000), actor: who.name,
  }]);
  return json({ ok: true });
}
