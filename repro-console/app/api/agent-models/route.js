import { authorize, json } from "@/lib/auth";
import { DEFAULTS, ROLES, conflictsFor, normalise } from "@/lib/modelCatalog";
import { readSetting, writeSetting } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "agent-models";

export async function GET(req) {
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  const selection = normalise(await readSetting(KEY));
  return json({
    selection,
    defaults: DEFAULTS,
    conflicts: conflictsFor(selection),
    env: Object.fromEntries(ROLES.map((r) => [r.env, selection[r.id]])),
  });
}

export async function PUT(req) {
  const who = await authorize(req);
  if (!who) return json({ error: "Not signed in." }, 401);
  if (who.kind === "user" && who.role !== "approver" && !who.open) {
    return json({ error: "Viewers can watch but not change the ensemble." }, 403);
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const selection = normalise(body.selection);
  await writeSetting(KEY, selection);
  return json({
    selection,
    conflicts: conflictsFor(selection),
    env: Object.fromEntries(ROLES.map((r) => [r.env, selection[r.id]])),
  });
}
