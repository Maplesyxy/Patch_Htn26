import { storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    store: storeKind,
    onVercel: !!process.env.VERCEL,
    // Whether a passer-by can wipe the demo.
    resetProtected: !!process.env.SANDBOX_ADMIN,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
