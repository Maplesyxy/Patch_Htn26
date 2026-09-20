import { listFeedback } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the support engineer reads. Raw customer words, unedited.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const feedback = await listFeedback({ kind: p.get("kind") || undefined, since: p.get("since") || undefined });
  return new Response(JSON.stringify({ count: feedback.length, feedback }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
