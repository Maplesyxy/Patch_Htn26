import RunRoom from "@/components/RunRoom";
import { DEMO_TRACE } from "@/lib/demoTrace";

const DEMO_ONLY = process.env.NEXT_PUBLIC_DEMO_ONLY === "1";

export async function generateStaticParams() {
  return DEMO_ONLY ? [{ runId: "demo" }] : [];
}

export default async function Page({ params }) {
  const { runId } = await params;
  if (DEMO_ONLY && runId === "demo") {
    const run = { id: "demo", title: "Simulated replay: duplicate reservations from one booking attempt", workspace: "Hack the North", stage: "S0", status: "running", simulated: true, demoIndex: 0, eventCount: DEMO_TRACE.length, createdAt: "2026-09-20T12:00:00.000Z" };
    return <RunRoom runId="demo" preview={{ demo: true, run, events: [], me: { name: "Demo visitor", role: "viewer", signInOn: false }, tab: "incident" }} />;
  }
  return <RunRoom runId={runId} />;
}
