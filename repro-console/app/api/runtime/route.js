import { authorize, json } from "@/lib/auth";
import { getRuntimeHealth, RuntimeError } from "@/lib/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to check the live runtime." }, 401);
  try {
    return json(await getRuntimeHealth());
  } catch (error) {
    const message = error instanceof RuntimeError
      ? error.message
      : "The live reproduction runtime is unavailable. Start it and check the server configuration.";
    return json({ available: false, ready: false, error: message }, 503);
  }
}
