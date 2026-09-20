import { addFeedback } from "@/lib/store";
import { RESTAURANTS } from "@/lib/restaurants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

let counter = 0;

// Where a customer reports a bug or leaves a review. This is the intake the agent team
// reads. No names and no email addresses are collected: an account id is the only
// identifier, because everything downstream ends up in an append-only event log.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }

  const kind = body.kind === "review" ? "review" : "bug";
  const subject = String(body.subject || "").trim().slice(0, 140);
  const text = String(body.body || "").trim().slice(0, 4000);
  const account = /^A-\d{4}$/.test(String(body.account || "")) ? String(body.account) : null;
  const restaurant = RESTAURANTS.some((r) => r.id === body.restaurant) ? body.restaurant : null;
  const rating = Number.isFinite(Number(body.rating)) ? Math.min(5, Math.max(1, Number(body.rating))) : null;

  if (!subject) return json({ error: "Give it a short summary." }, 400);
  if (!text) return json({ error: "Tell us what happened." }, 400);

  const row = {
    id: `FB-${Date.now().toString(36)}-${(counter++).toString(36)}`,
    kind, subject, body: text, account, restaurant, rating,
    page: String(body.page || "").slice(0, 200),
    // A coarse client hint, deliberately not trusted: what a customer's browser says it
    // is has to be tested, not inherited.
    client_hint: String(req.headers.get("user-agent") || "").slice(0, 160),
    created_at: new Date().toISOString(),
    status: "new",
  };
  await addFeedback(row);
  return json({ ok: true, id: row.id }, 201);
}
