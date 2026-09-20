import { listReservations } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The system of record. observe() reads this, never the UI: two confirmation
// toasts are not two reservations.
export async function GET(req) {
  const account = new URL(req.url).searchParams.get("account") || "";
  const reservations = await listReservations(account);
  return new Response(JSON.stringify({ account: account || null, count: reservations.length, reservations }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
