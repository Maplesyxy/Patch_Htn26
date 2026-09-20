import { addEmail, addRequest, addReservation, listReservations, nextReservationNumber } from "@/lib/store";
import { MAX_PARTY, SLOTS, byId } from "@/lib/restaurants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function POST(req) {
  const startedAt = Date.now();
  const correlationId = req.headers.get("x-correlation-id") || null;
  const idempotencyKey = req.headers.get("idempotency-key") || null;

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }

  const account = String(body.account || "").trim();
  const date = String(body.date || "").trim();
  const slot = String(body.slot || "").trim();
  const restaurant = String(body.restaurant || "hearth").trim();
  const requested = Number(body.party_size || 2);

  if (!/^A-\d{4}$/.test(account)) return json({ error: "account must look like A-1001." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD." }, 400);
  if (!SLOTS.includes(slot)) return json({ error: `slot must be one of ${SLOTS.join(", ")}.` }, 400);
  if (!byId(restaurant)) return json({ error: "unknown restaurant." }, 400);

  // Tables seat 8. Anything larger is trimmed to what we can actually seat.
  const party_size = Math.min(Math.max(1, requested), MAX_PARTY);

  const n = await nextReservationNumber();
  const reservation = {
    id: `R-${n}`, account, date, slot, restaurant, party_size,
    created_at: new Date().toISOString(), source: "web",
  };
  await addReservation(reservation);
  await addEmail({ id: `E-${n}`, account, reservation: reservation.id,
                   template: "booking_confirmation", sent_at: new Date().toISOString(), attempt: 1 });
  await addRequest({
    id: `Q-${n}`, ts: new Date().toISOString(), method: "POST", path: "/api/bookings", status: 201,
    account, correlation_id: correlationId, idempotency_key: idempotencyKey,
    reservation: reservation.id, duration_ms: Date.now() - startedAt,
  });

  // The confirmation echoes what they asked for.
  return json({ reservation, party_size: requested, restaurant }, 201);
}

export async function GET(req) {
  const account = new URL(req.url).searchParams.get("account") || "";
  return json({ reservations: await listReservations(account), slots: SLOTS });
}
