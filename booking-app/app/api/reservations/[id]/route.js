import { cancelReservation } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Cancel a reservation.
export async function DELETE(req, { params }) {
  const { id } = await params;
  const row = await cancelReservation(String(id));
  if (!row) return json({ error: "No such reservation." }, 404);
  return json({ ok: true, reservation: row });
}
