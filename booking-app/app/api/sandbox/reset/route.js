import { adminOk } from "@/lib/admin";
import { reseed } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Put the sandbox back to a known state. Called before every run in the matrix.
export async function POST(req) {
  if (!adminOk(req)) return json({ error: "Set x-sandbox-admin." }, 401);
  const seeded = await reseed();
  return json({ ok: true, seeded });
}
