"use client";

import { useEffect, useState } from "react";
import { STAGES } from "@/lib/agents";

function stageName(id) {
  const s = STAGES.find((x) => x.id === id);
  return s ? s.name : id;
}

export default function Home() {
  const [me, setMe] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  async function load() {
    try {
      const [m, r] = await Promise.all([fetch("/api/me"), fetch("/api/runs")]);
      if (m.status === 401) { window.location.href = "/login"; return; }
      setMe(await m.json());
      setRuns((await r.json()).runs || []);
    } catch {
      setError("Could not reach the server. Reload to try again.");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function startReplay() {
    setStarting(true);
    const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simulated: true }) });
    const data = await res.json();
    if (res.ok) window.location.href = `/runs/${data.run.id}`;
    else { setError(data.error || "Could not start the replay."); setStarting(false); }
  }

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";

  return (
    <main className="home">
      <header className="home-head">
        <div>
          <h1>Investigations</h1>
          <p className="muted">Each run is one instruction given to the agent team. Open one to watch the team work.</p>
        </div>
        {me ? (
          <div className="who">
            <span>{me.name}, {me.role}</span>
            {me.signInOn ? <button className="btn quiet" onClick={signOut}>Sign out</button> : null}
          </div>
        ) : null}
      </header>

      {me && !me.signInOn ? (
        <p className="notice warn">Sign-in is off, so anyone with this URL can approve actions. Set REPRO_APPROVER_PASSWORD and REPRO_SESSION_SECRET before sharing it.</p>
      ) : null}
      {me && me.store === "memory" && me.onVercel ? (
        <p className="notice warn">No Redis is connected. On Vercel each request can land on a different instance, so runs will appear and vanish. Add Upstash Redis from the Vercel Marketplace and redeploy.</p>
      ) : null}
      {error ? <p className="notice bad" role="alert">{error}</p> : null}

      <section className="runs">
        {runs === null ? <p className="muted">Loading runs</p> : null}
        {runs && runs.length === 0 ? (
          <div className="empty">
            <h2>No runs yet</h2>
            <p>Runs appear here when your agent runtime creates one. To check this deployment first, play the simulated replay of the double-booking investigation.</p>
          </div>
        ) : null}
        {runs && runs.map((r) => (
          <a key={r.id} className="run-row" href={`/runs/${r.id}`}>
            <span className="run-title">{r.title}</span>
            <span className="run-meta">
              {r.simulated ? <span className="pill sim">Simulated</span> : <span className="pill">{r.workspace}</span>}
              <span>{r.status === "finished" ? "Finished" : stageName(r.stage)}</span>
              <span>{r.eventCount || 0} events</span>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </span>
          </a>
        ))}
      </section>

      {me && me.role === "approver" ? (
        <button className="btn" onClick={startReplay} disabled={starting}>
          {starting ? "Starting replay" : "Play simulated replay"}
        </button>
      ) : null}

      <section className="connect">
        <h2>Connect the agent runtime</h2>
        <p className="muted">The agents run outside Vercel, next to the sandboxed app and the browser. They report here over HTTPS with a workspace token.</p>
        <pre>{`export REPRO_CONSOLE_URL=${origin}
export REPRO_INGEST_TOKEN=<token from REPRO_INGEST_TOKENS>
python worker/example_run.py`}</pre>
      </section>
    </main>
  );
}
