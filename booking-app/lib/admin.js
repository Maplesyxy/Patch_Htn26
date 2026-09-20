// POST /api/sandbox/reset wipes every reservation, so it is guarded whenever
// SANDBOX_ADMIN is set. Reads are open: everything in here is synthetic.

export function adminOk(req) {
  const expected = process.env.SANDBOX_ADMIN;
  if (!expected) return true; // local dev; /api/health reports resetProtected:false
  const presented = req.headers.get("x-sandbox-admin") || "";
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
