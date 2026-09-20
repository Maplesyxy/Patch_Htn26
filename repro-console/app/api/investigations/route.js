import { authorize, json } from "@/lib/auth";
import { appendEvents, createRun, getRun, patchRun } from "@/lib/store";
import {
  enqueueRuntimeRun,
  getRuntimeHealth,
  isApprover,
  isSameOriginMutation,
  RuntimeError,
  runtimeWorkspace,
  validateInvestigationInput,
} from "@/lib/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const who = await authorize(req);
  if (!who || who.kind !== "user") return json({ error: "Sign in to start an investigation." }, 401);
  if (!isApprover(who)) return json({ error: "Only approvers can start a live investigation." }, 403);
  if (!isSameOriginMutation(req)) return json({ error: "Cross-origin investigation requests are not allowed." }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Send the investigation details as JSON." }, 400); }
  const parsed = validateInvestigationInput(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const input = parsed.value;

  let health;
  try { health = await getRuntimeHealth(); } catch (error) {
    return json({ error: error instanceof RuntimeError ? error.message : "The live reproduction runtime is unavailable." }, 503);
  }
  if (!health.ready) {
    return json({ error: "The live runtime is connected but is not ready to investigate yet.", missing: health.missing }, 503);
  }
  if (!health.providers[input.provider]?.configured) {
    const providerName = input.provider === "browserbase" ? "Browserbase" : "Local browser";
    return json({ error: `${providerName} is not configured in the live runtime.` }, 503);
  }

  let workspace;
  try { workspace = runtimeWorkspace(); } catch (error) {
    return json({ error: error instanceof RuntimeError ? error.message : "The live runtime workspace is not configured correctly." }, 503);
  }

  const run = await createRun({
    title: input.brief.title,
    workspace,
    simulated: false,
    createdBy: who.name || "approver",
  });
  await patchRun(run.id, { targetUrl: input.targetUrl, provider: input.provider, mode: "live" });
  await appendEvents(run.id, [{
    kind: "system",
    from: "system",
    type: "RUN_STARTED",
    ts: new Date().toISOString(),
    body: `Live investigation queued with ${input.provider === "browserbase" ? "Browserbase" : "the local browser"}.`,
  }]);

  try {
    await enqueueRuntimeRun({
      runId: run.id,
      targetUrl: input.targetUrl,
      report: input.report,
      brief: input.brief,
      provider: input.provider,
    });
  } catch (error) {
    const message = error instanceof RuntimeError
      ? error.message
      : "The live runtime did not accept this investigation. Check its connection and retry.";
    if (error instanceof RuntimeError && error.ambiguous) {
      const body = `The console could not confirm whether the runtime accepted this investigation. It may still be running; keep this room open for updates, or stop the run if no activity appears. ${message}`;
      try {
        await appendEvents(run.id, [{
          kind: "system",
          from: "system",
          type: "RUN_DISPATCH_UNKNOWN",
          ts: new Date().toISOString(),
          body,
        }]);
      } catch {
        // Keep returning the run id even if the event store is temporarily unavailable.
      }
      return json({ runId: run.id, dispatch: "unknown", warning: body }, 202);
    }
    try {
      await appendEvents(run.id, [{
        kind: "system",
        from: "system",
        type: "RUN_BLOCKED",
        ts: new Date().toISOString(),
        body: message,
        data: { outcome: "blocked", summary: message.slice(0, 500) },
      }]);
    } catch {
      // Preserve the run id and original error even if the event store is also unavailable.
    }
    return json({ runId: run.id, error: message }, 502);
  }

  return json({ runId: run.id, run: await getRun(run.id) }, 201);
}
