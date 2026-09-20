import { bookedForSlot } from "@/lib/store";
import { SLOTS, TABLES_PER_SLOT, byId } from "@/lib/restaurants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// How many tables are left at each sitting.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const restaurant = p.get("restaurant") || "";
  const date = p.get("date") || "";
  if (!byId(restaurant)) return json({ error: "unknown restaurant." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD." }, 400);

  const availability = {};
  for (const slot of SLOTS) {
    const taken = await bookedForSlot(restaurant, date, slot);
    availability[slot] = { taken, remaining: Math.max(0, TABLES_PER_SLOT - taken), tables: TABLES_PER_SLOT };
  }
  return json({ restaurant, date, availability });
}
