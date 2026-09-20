"use client";

import PatchIcon from "./PatchIcon";
import "./ensemble.css";

const SWARM = [
  ["compass", "Supervisor", "Directs experiments, owns hypotheses, and can interrupt the swarm."],
  ["play", "Execution", "Drives the browser harness and runs controlled experiments."],
  ["layers", "Incidents", "Follows telemetry for errors, warnings and suspicious actions."],
];

/** The one canonical picture of how a report becomes a verified fix. */
export default function EnsembleDiagram({ models = {} }) {
  const label = (role, fallback) => models[role] || fallback;
  return (
    <section className="patch-ensemble" aria-label="How Patch works">
      <header className="patch-ensemble-head">
        <span>INVESTIGATION FLOW</span>
        <span>Report → Reproduction → Fix</span>
      </header>

      <div className="patch-ensemble-flow">
        <article className="patch-ensemble-stage patch-ensemble-intake">
          <span className="patch-ensemble-icon"><PatchIcon name="inbox" size={18} /></span>
          <small>CUSTOMER AGENT</small>
          <strong>Intake</strong>
          <p>Turns a report into expected, actual, steps and unknowns.</p>
          <em>{label("customer", "Gemini Flash")}</em>
        </article>

        <span className="patch-ensemble-arrow" aria-hidden="true" />

        <article className="patch-ensemble-stage patch-ensemble-swarm">
          <header>
            <small>REPRODUCTION SWARM</small>
            <span className="patch-ensemble-count">3 roles</span>
          </header>
          <ul>
            {SWARM.map(([icon, title, desc], i) => (
              <li key={title}>
                <span className="patch-ensemble-role-icon"><PatchIcon name={icon} size={15} /></span>
                <div>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                  <em>{label(title.toLowerCase(), "—")}</em>
                </div>
                <span className="patch-ensemble-index">{String(i + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ul>
          <footer>Output: controlled experiments, traces, and a failing regression test.</footer>
        </article>

        <span className="patch-ensemble-arrow" aria-hidden="true" />

        <article className="patch-ensemble-stage patch-ensemble-fix">
          <span className="patch-ensemble-icon"><PatchIcon name="code" size={18} /></span>
          <small>IMPLEMENTATION</small>
          <strong>Fix</strong>
          <p>Patches in an isolated worktree, inside a file allowlist.</p>
          <em>{label("implementation", "Claude Code Opus")}</em>
        </article>
      </div>

      <footer className="patch-ensemble-foot">
        <span><PatchIcon name="shield" size={15} /><strong>Independent verification</strong> Protected tests run against the patch before any verdict is recorded.</span>
        <span><PatchIcon name="layers" size={15} /><strong>One evidence trail</strong> Every handoff is appended, never overwritten.</span>
      </footer>
    </section>
  );
}
