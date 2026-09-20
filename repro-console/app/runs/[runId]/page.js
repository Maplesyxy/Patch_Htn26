import RunRoom from "@/components/RunRoom";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const { runId } = await params;
  return <RunRoom runId={runId} />;
}
