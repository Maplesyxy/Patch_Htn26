import { listRequests } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The request log the SRE analyst reads. Some rows have no correlation id.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const requests = await listRequests({
    account: p.get("account") || undefined,
    path: p.get("path") || undefined,
    limit: Math.min(500, Number(p.get("limit")) || 200),
  });
  return new Response(JSON.stringify({ count: requests.length, requests }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
