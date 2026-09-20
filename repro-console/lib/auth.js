// Works in both the Edge middleware and Node route handlers (Web Crypto only).

const enc = new TextEncoder();
const COOKIE = "repro_session";
const WEEK = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = COOKIE;

export function authEnabled() {
  return !!(process.env.REPRO_VIEWER_PASSWORD || process.env.REPRO_APPROVER_PASSWORD);
}

function sessionSecret() {
  return process.env.REPRO_SESSION_SECRET || "";
}

function toB64Url(str) {
  const bytes = enc.encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession({ name, role }) {
  const body = toB64Url(JSON.stringify({ name, role, exp: Date.now() + WEEK }));
  return `${body}.${await hmac(sessionSecret(), body)}`;
}

export async function readSession(token) {
  if (!token || !sessionSecret()) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(sessionSecret(), body))) return null;
  try {
    const s = JSON.parse(fromB64Url(body));
    if (!s.exp || s.exp < Date.now()) return null;
    return { name: s.name, role: s.role };
  } catch {
    return null;
  }
}

export function roleForPassword(password) {
  const approver = process.env.REPRO_APPROVER_PASSWORD;
  const viewer = process.env.REPRO_VIEWER_PASSWORD;
  if (approver && safeEqual(password, approver)) return "approver";
  if (viewer && safeEqual(password, viewer)) return "viewer";
  return null;
}

function ingestTokens() {
  const out = [];
  for (const pair of (process.env.REPRO_INGEST_TOKENS || "").split(",")) {
    const i = pair.indexOf(":");
    if (i < 1) continue;
    const workspace = pair.slice(0, i).trim();
    const tok = pair.slice(i + 1).trim();
    if (workspace && tok) out.push({ workspace, tok });
  }
  return out;
}

/**
 * Who is calling?
 *  { kind: "worker", workspace }            agent runtime with a bearer token
 *  { kind: "user", name, role }             signed-in person (viewer | approver)
 *  null                                     nobody we know
 */
export async function authorize(req) {
  const header = req.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const presented = header.slice(7).trim();
    for (const { workspace, tok } of ingestTokens()) {
      if (safeEqual(presented, tok)) return { kind: "worker", workspace };
    }
    return null;
  }
  if (!authEnabled()) return { kind: "user", name: "local", role: "approver", open: true };
  const cookie = req.cookies.get(COOKIE);
  const session = await readSession(cookie && cookie.value);
  return session ? { kind: "user", ...session } : null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
