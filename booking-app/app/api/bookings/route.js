import { addEmail, addRequest, addReservation, listReservations, nextReservationNumber } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const SLOTS = ["12:00", "12:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

export async function POST(req) {
  const startedAt = Date.now();
  const correlationId = req.headers.get("x-correlation-id") || null;
  const idempotencyKey = req.headers.get("idempotency-key") || null;

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }

  const account = String(body.account || "").trim();
  const date = String(body.date || "").trim();
  const slot = String(body.slot || "").trim();

  if (!/^A-\d{4}$/.test(account)) return json({ error: "account must look like A-1001." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD." }, 400);
  if (!SLOTS.includes(slot)) return json({ error: `slot must be one of ${SLOTS.join(", ")}.` }, 400);

  const n = await nextReservationNumber();
  const reservation = {
    id: `R-${n}`,
    account,
    date,
    slot,
    created_at: new Date().toISOString(),
    source: "web",
  };
  await addReservation(reservation);
  await addEmail({
    id: `E-${n}`,
    account,
    reservation: reservation.id,
    template: "booking_confirmation",
    sent_at: new Date().toISOString(),
    attempt: 1,
  });
  await addRequest({
    id: `Q-${n}`,
    ts: new Date().toISOString(),
    method: "POST",
    path: "/api/bookings",
    status: 201,
    account,
    correlation_id: correlationId,
    idempotency_key: idempotencyKey,
    reservation: reservation.id,
    duration_ms: Date.now() - startedAt,
  });

  return json({ reservation }, 201);
}

export async function GET(req) {
  const account = new URL(req.url).searchParams.get("account") || "";
  return json({ reservations: await listReservations(account), slots: SLOTS });
}
