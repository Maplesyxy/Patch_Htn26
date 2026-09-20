import { authorize, json } from "@/lib/auth";
import { getRun, readEvents } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Server-sent events. Each connection lives ~50s, then the browser's EventSource
// reconnects by itself and resumes from Last-Event-ID, so nothing is missed.
export async function GET(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  const run = await getRun(runId);
  if (!run) return json({ error: "No such run." }, 404);

  const url = new URL(req.url);
  let cursor = Number(req.headers.get("last-event-id") || url.searchParams.get("after") || 0) || 0;
  const enc = new TextEncoder();
  let open = true;
  req.signal.addEventListener("abort", () => { open = false; });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text) => { try { controller.enqueue(enc.encode(text)); } catch { open = false; } };
      send("retry: 1000\n\n");
      const deadline = Date.now() + 50000;
      while (open && Date.now() < deadline) {
        let events = [];
        try { events = await readEvents(runId, cursor, 200); } catch { send(": store error\n\n"); }
        for (const e of events) {
          send(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
          cursor = e.seq;
        }
        if (!events.length) send(": keep-alive\n\n");
        await sleep(events.length ? 250 : 1200);
      }
      try { controller.close(); } catch {}
    },
    cancel() { open = false; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
