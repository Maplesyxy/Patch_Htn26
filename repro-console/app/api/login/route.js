import { authEnabled, roleForPassword, signSession, SESSION_COOKIE, json } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req) {
  if (!authEnabled()) return json({ ok: true, role: "approver", open: true });
  if (!process.env.REPRO_SESSION_SECRET) {
    return json({ error: "Sign-in is on but REPRO_SESSION_SECRET is not set. Add it in Vercel and redeploy." }, 500);
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const name = String(body.name || "").trim().slice(0, 60);
  const role = roleForPassword(String(body.password || ""));
  if (!name) return json({ error: "Enter your name. It is recorded on every approval." }, 400);
  if (!role) return json({ error: "That password does not match a viewer or approver." }, 401);
  const token = await signSession({ name, role });
  const res = json({ ok: true, role });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return res;
}

export async function DELETE() {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
