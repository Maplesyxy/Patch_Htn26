import { authorize, json } from "@/lib/auth";
import { getRun, appendEvents, readEvents } from "@/lib/store";
import { validateWorkerEvent, rejectedEvent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  ?after=<seq>[&human=1]   read the log (the agent runtime polls this for human input)
export async function GET(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  const run = await getRun(runId);
  if (!run) return json({ error: "No such run." }, 404);
  if (who.kind === "worker" && run.workspace !== who.workspace) return json({ error: "Run belongs to another workspace." }, 403);
  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") || 0);
  let events = await readEvents(runId, after);
  const cursor = events.length ? events[events.length - 1].seq : after;
  if (url.searchParams.get("human")) events = events.filter((e) => e.from === "human");
  return json({ run, events, cursor });
}

// POST { events: [...] }   append from the agent runtime
export async function POST(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who) return json({ error: "Missing or unknown ingest token." }, 401);
  if (who.kind === "user" && !who.open) return json({ error: "Only the agent runtime can write events." }, 403);
  const run = await getRun(runId);
  if (!run) return json({ error: "No such run." }, 404);
  if (run.simulated) return json({ error: "This is a simulated replay. Create a real run to write events." }, 409);
  if (who.kind === "worker" && run.workspace !== who.workspace) return json({ error: "Run belongs to another workspace." }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const incoming = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
  if (!incoming.length) return json({ error: "No events." }, 400);
  if (incoming.length > 100) return json({ error: "At most 100 events per request." }, 413);

  const toAppend = [];
  const rejected = [];
  incoming.forEach((raw, index) => {
    const v = validateWorkerEvent(raw);
    if (v.ok) toAppend.push(v.event);
    else {
      rejected.push({ index, reason: v.reason });
      toAppend.push(rejectedEvent(raw, v.reason)); // rejections are part of the record
    }
  });
  const cursor = await appendEvents(runId, toAppend);
  return json({ accepted: incoming.length - rejected.length, rejected, cursor }, rejected.length ? 207 : 200);
}
