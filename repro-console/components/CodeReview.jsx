"use client";

import { useEffect, useMemo, useState } from "react";
import PatchIcon from "./PatchIcon";
import { diffTotals, parseDiff } from "@/lib/diff";
import "./code-review.css";

const statusLabel = { added: "added", deleted: "deleted", renamed: "renamed", modified: "changed" };

function FileDiff({ file }) {
  if (file.binary) {
    return <p className="cr-binary">Binary file not shown.</p>;
  }
  if (!file.hunks.length) {
    return <p className="cr-binary">No textual changes.</p>;
  }
  return (
    <div className="cr-diff">
      {file.hunks.map((hunk, hi) => (
        <div className="cr-hunk" key={hi}>
          <div className="cr-hunk-head">
            <span>{hunk.header.split("@@")[1] ? `@@${hunk.header.split("@@")[1]}@@` : hunk.header}</span>
            {hunk.context ? <em>{hunk.context}</em> : null}
          </div>
          {hunk.lines.map((line, li) => (
            <div className={`cr-line cr-${line.type}`} key={li}>
              <span className="cr-num">{line.old ?? ""}</span>
              <span className="cr-num">{line.new ?? ""}</span>
              <span className="cr-sign">{line.type === "add" ? "+" : line.type === "del" ? "-" : " "}</span>
              <code>{line.text || " "}</code>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function CodeReview({ runId, open, onClose }) {
  const [raw, setRaw] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (!runId) { setState("norun"); return; }
    let cancelled = false;
    setState("loading"); setError(""); setRaw("");
    fetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/patch.diff`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "No patch has been produced for this investigation yet." : "The runtime could not return the patch.");
        return r.text();
      })
      .then((t) => { if (!cancelled) { setRaw(t); setState("ready"); setActive(0); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setState("error"); } });
    return () => { cancelled = true; };
  }, [open, runId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const files = useMemo(() => parseDiff(raw), [raw]);
  const totals = useMemo(() => diffTotals(files), [files]);
  const file = files[active];

  if (!open) return null;

  return (
    <div className="cr-backdrop" role="dialog" aria-modal="true" aria-label="Code review">
      <div className="cr-panel">
        <header className="cr-head">
          <div>
            <span className="cr-eyebrow">CODE REVIEW</span>
            <h2>Proposed change</h2>
            <p>{runId ? <code>{runId}</code> : "No investigation selected"}</p>
          </div>
          <div className="cr-head-right">
            {state === "ready" && totals.files ? (
              <span className="cr-totals">
                <strong>{totals.files}</strong> file{totals.files === 1 ? "" : "s"}
                <span className="cr-add">+{totals.added}</span>
                <span className="cr-del">−{totals.removed}</span>
              </span>
            ) : null}
            <button type="button" className="cr-close" onClick={onClose} aria-label="Close code review">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {state === "norun" ? (
          <p className="cr-empty">
            No investigation has run yet. Start one, and any patch it proposes shows up here.
          </p>
        ) : null}
        {state === "loading" ? <p className="cr-empty">Loading the patch…</p> : null}
        {state === "error" ? <p className="cr-empty cr-empty-bad"><PatchIcon name="alert" size={15} />{error}</p> : null}
        {state === "ready" && !files.length ? (
          <p className="cr-empty">The patch is empty. Nothing was changed.</p>
        ) : null}

        {state === "ready" && files.length ? (
          <div className="cr-body">
            <nav className="cr-files" aria-label="Files changed">
              <span className="cr-files-head">Files changed</span>
              {files.map((f, i) => (
                <button key={f.path} type="button" className={`cr-file${i === active ? " is-active" : ""}`} onClick={() => setActive(i)}>
                  <span className={`cr-badge cr-badge-${f.status}`}>{statusLabel[f.status] || f.status}</span>
                  <span className="cr-path" title={f.path}>
                    <span className="cr-dir">{f.path.split("/").slice(0, -1).join("/")}/</span>
                    <span className="cr-name">{f.path.split("/").pop()}</span>
                  </span>
                  <span className="cr-counts">
                    <span className="cr-add">+{f.added}</span>
                    <span className="cr-del">−{f.removed}</span>
                  </span>
                </button>
              ))}
            </nav>
            <div className="cr-view">
              <div className="cr-view-head">
                <code>{file.path}</code>
                <span>
                  <span className="cr-add">+{file.added}</span>
                  <span className="cr-del">−{file.removed}</span>
                </span>
              </div>
              <FileDiff file={file} />
            </div>
          </div>
        ) : null}

        <footer className="cr-foot">
          <PatchIcon name="shield" size={14} />
          <span>
            Read only. Approving a pull request happens in the investigation room, and a person
            decides. Patches are written in an isolated worktree, never on your branch.
          </span>
        </footer>
      </div>
    </div>
  );
}
