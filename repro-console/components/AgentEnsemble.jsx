"use client";

import { useEffect, useState } from "react";
import PatchIcon from "./PatchIcon";
import "./ensemble.css";
import { CONFLICTS, DEFAULTS, FAMILIES, MODELS, ROLES, conflictsFor } from "@/lib/modelCatalog";

export default function AgentEnsemble({ canEdit = true, onChange }) {
  const [selection, setSelection] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent-models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) { setSelection(d.selection); onChange?.(d.selection); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next) {
    setSelection(next);
    onChange?.(next);
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/agent-models", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "That did not save.");
      else setStatus("Saved");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const conflicts = conflictsFor(selection);
  const conflicted = new Set(conflicts.flatMap((c) => c.roles));
  const atDefaults = ROLES.every((r) => selection[r.id] === DEFAULTS[r.id]);

  return (
    <section className="patch-ensemble-config">
      <div className="patch-ensemble-config-bar">
        <p className="patch-ensemble-hint">
          <PatchIcon name="shield" size={14} />
          A starred model is our recommendation for that role. You can change any of them.
        </p>
        <div className="patch-ensemble-actions">
          {status ? <span className="patch-save-state">{status}</span> : null}
          {error ? <span className="patch-save-state bad">{error}</span> : null}
          <button type="button" className="patch-button" disabled={atDefaults || saving || !canEdit}
                  onClick={() => persist({ ...DEFAULTS })}>
            Reset to recommended
          </button>
        </div>
      </div>

      <div className="patch-role-cards">
        {ROLES.map((role) => {
          const chosen = selection[role.id];
          const fam = FAMILIES[MODELS[chosen]?.family] || {};
          const isConflicted = conflicted.has(role.id);
          return (
            <article key={role.id} className={`patch-role-card${isConflicted ? " is-conflicted" : ""}`}>
              <header>
                <span className="patch-role-card-icon"><PatchIcon name={role.icon} size={16} /></span>
                <div>
                  <strong>{role.label}</strong>
                  <p>{role.blurb}</p>
                </div>
                <span className="patch-family-mark" style={{ "--fam": fam.color || "#64705E" }} title={fam.label}>
                  {fam.mark || "?"}
                </span>
              </header>

              <label className="visually-hidden" htmlFor={`model-${role.id}`}>Model for {role.label}</label>
              <select id={`model-${role.id}`} value={chosen} disabled={!canEdit || saving}
                      onChange={(e) => persist({ ...selection, [role.id]: e.target.value })}>
                {role.options.map((id) => (
                  <option key={id} value={id}>
                    {id === role.recommended ? "★ " : ""}{MODELS[id].label}
                    {id === role.recommended ? "  (recommended)" : ""}
                  </option>
                ))}
              </select>

              <p className="patch-role-note">{MODELS[chosen]?.note}</p>
              <p className="patch-role-wants"><span>Needs</span> {role.wants}</p>
              <code className="patch-role-env">{role.env}={chosen}</code>
            </article>
          );
        })}
      </div>

      {conflicts.length ? (
        <div className="patch-conflicts" role="alert">
          {conflicts.map((c) => (
            <p key={c.pair.join("-")} className="patch-conflict">
              <PatchIcon name="alert" size={15} />
              <span>
                <strong>Not recommended · {c.title}</strong>
                {c.why}
              </span>
            </p>
          ))}
        </div>
      ) : (
        <p className="patch-no-conflict">
          <PatchIcon name="shield" size={14} />
          No shared families across the pairings that need to disagree.
        </p>
      )}

      <details className="patch-separation">
        <summary>Which pairings are checked, and why</summary>
        <ul>
          {CONFLICTS.map((c) => <li key={c.pair.join("-")}><strong>{c.pair[0]} ↔ {c.pair[1]}.</strong> {c.why}</li>)}
        </ul>
      </details>
    </section>
  );
}
