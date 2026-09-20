import { listEmails } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the customer actually received. Sends and reservations are not 1:1.
export async function GET(req) {
  const account = new URL(req.url).searchParams.get("account") || "";
  const emails = await listEmails(account);
  return new Response(JSON.stringify({ account: account || null, count: emails.length, emails }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
