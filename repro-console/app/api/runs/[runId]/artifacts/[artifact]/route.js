import { authorize, json } from "@/lib/auth";
import { getRun } from "@/lib/store";
import { canAccessRun, getRuntimeArtifact, RuntimeError, safeArtifactName, safeRunId } from "@/lib/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeMimeType(value) {
  const type = typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(type) ? type : "application/octet-stream";
}

export async function GET(req, { params }) {
  const { runId, artifact } = await params;
  const who = await authorize(req);
  if (!who) return json({ error: "Sign in to view run artifacts." }, 401);
  if (!safeRunId(runId) || !safeArtifactName(artifact)) return json({ error: "Invalid artifact path." }, 400);

  const run = await getRun(runId);
  if (!run) return json({ error: "No such investigation." }, 404);
  if (!canAccessRun(who, run)) return json({ error: "You cannot access this run's artifacts." }, 403);

  try {
    const upstream = await getRuntimeArtifact(runId, artifact, req.headers.get("range") || undefined);
    if (!upstream.ok && upstream.status !== 206) {
      return json({ error: upstream.status === 404 ? "Artifact not found." : "The runtime could not return this artifact." }, upstream.status === 404 ? 404 : 503);
    }
    const mime = safeMimeType(upstream.headers.get("content-type"));
    const inlineImage = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(mime);
    const headers = new Headers({
      "Content-Type": mime,
      "Content-Disposition": `${inlineImage ? "inline" : "attachment"}; filename="${artifact}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentRange = upstream.headers.get("content-range");
    if (contentRange && /^bytes [0-9]+-[0-9]+\/(?:[0-9]+|\*)$/.test(contentRange)) headers.set("Content-Range", contentRange);
    if (upstream.headers.get("accept-ranges") === "bytes") headers.set("Accept-Ranges", "bytes");
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  } catch (error) {
    const message = error instanceof RuntimeError ? error.message : "The live runtime could not return this artifact.";
    return json({ error: message }, error instanceof RuntimeError ? error.status : 503);
  }
}
