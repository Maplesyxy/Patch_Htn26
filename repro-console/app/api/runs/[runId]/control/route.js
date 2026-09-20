import { authorize, json } from "@/lib/auth";
import { getRun } from "@/lib/store";
import { isApprover, isSameOriginMutation, RuntimeError, safeRunId, stopRuntimeRun } from "@/lib/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const { runId } = await params;
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to control an investigation." }, 401);
  if (!isApprover(who)) return json({ error: "Only approvers can control a live investigation." }, 403);
  if (!isSameOriginMutation(req)) return json({ error: "Cross-origin control requests are not allowed." }, 403);
  if (!safeRunId(runId)) return json({ error: "Invalid investigation id." }, 400);

  const run = await getRun(runId);
  if (!run) return json({ error: "No such investigation." }, 404);
  if (run.simulated || run.mode !== "live") return json({ error: "Simulated runs cannot be controlled by the live runtime." }, 409);
  if (run.status !== "running") return json({ error: "This investigation is no longer running." }, 409);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send a JSON control action." }, 400); }
  if (body?.action !== "stop") return json({ error: "The supported control action is stop." }, 400);

  try {
    await stopRuntimeRun(runId);
    return json({ runId, status: "stop_requested" });
  } catch (error) {
    const message = error instanceof RuntimeError ? error.message : "The live runtime could not stop this investigation.";
    return json({ error: message }, error instanceof RuntimeError ? error.status : 503);
  }
}
