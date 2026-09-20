"use client";

import { useEffect, useState } from "react";
import PatchIcon from "./PatchIcon";
import { MODELS } from "@/lib/modelCatalog";
import "./ensemble.css";

const SWARM = [
  ["compass", "Supervisor", "supervisor", "Directs experiments and can interrupt."],
  ["play", "Execution", "execution", "Drives the browser harness."],
  ["layers", "Incidents", "incidents", "Follows telemetry for suspicious signals."],
];

/** The one canonical picture of how a report becomes a verified fix.
 *  `detailed` adds the per-role descriptions; the overview uses the compact form. */
export default function EnsembleDiagram({ models, detailed = false }) {
  const [live, setLive] = useState(null);

  // Show what the ensemble is actually configured to run, not a hard-coded caption.
  useEffect(() => {
    if (models) return;
    let cancelled = false;
    fetch("/api/agent-models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setLive(d.selection); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [models]);

  const chosen = models || live || {};
  const label = (role, fallback) => {
    const id = chosen[role];
    return (id && MODELS[id] ? MODELS[id].label : null) || fallback;
  };
  return (
    <section className={`patch-ensemble${detailed ? " is-detailed" : ""}`} aria-label="How Patch works">
      <header className="patch-ensemble-head">
        <span>INVESTIGATION FLOW</span>
        <span>Report → Reproduction → Fix</span>
      </header>

      <div className="patch-ensemble-flow">
        <article className="patch-ensemble-stage patch-ensemble-intake">
          <span className="patch-ensemble-icon"><PatchIcon name="inbox" size={15} /></span>
          <small>CUSTOMER AGENT</small>
          <strong>Intake</strong>
          {detailed ? <p>Turns a report into expected, actual, steps and unknowns.</p> : null}
          <em>{label("customer", "Gemini Flash")}</em>
        </article>

        <span className="patch-ensemble-arrow" aria-hidden="true" />

        <article className="patch-ensemble-stage patch-ensemble-swarm">
          <header>
            <small>REPRODUCTION SWARM</small>
            <span className="patch-ensemble-count">3 roles</span>
          </header>
          <ul>
            {SWARM.map(([icon, title, key, desc]) => (
              <li key={key}>
                <span className="patch-ensemble-role-icon"><PatchIcon name={icon} size={13} /></span>
                <div>
                  <strong>{title}</strong>
                  {detailed ? <p>{desc}</p> : null}
                </div>
                <em>{label(key, "")}</em>
              </li>
            ))}
          </ul>
        </article>

        <span className="patch-ensemble-arrow" aria-hidden="true" />

        <article className="patch-ensemble-stage patch-ensemble-fix">
          <span className="patch-ensemble-icon"><PatchIcon name="code" size={15} /></span>
          <small>IMPLEMENTATION</small>
          <strong>Fix</strong>
          {detailed ? <p>Patches in an isolated worktree, inside a file allowlist.</p> : null}
          <em>{label("implementation", "Claude Code Opus")}</em>
        </article>
      </div>

      <footer className="patch-ensemble-foot">
        <span><PatchIcon name="shield" size={13} />Protected tests run before any verdict</span>
        <span><PatchIcon name="layers" size={13} />One append-only evidence trail</span>
      </footer>
    </section>
  );
}
