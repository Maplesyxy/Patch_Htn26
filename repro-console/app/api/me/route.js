import { authorize, authEnabled, json } from "@/lib/auth";
import { storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  return json({
    name: who.name || who.workspace,
    role: who.role || "worker",
    signInOn: authEnabled(),
    store: storeKind,
    onVercel: !!process.env.VERCEL,
  });
}
