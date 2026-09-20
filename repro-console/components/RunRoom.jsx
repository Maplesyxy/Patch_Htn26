"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, AGENT_GROUPS, HUMAN, STAGES, PUSHBACK_TYPES, recordTypeForRef } from "@/lib/agents";
import { reduceEvents } from "@/lib/reduce";
import PatchShell from "./PatchShell";
import CodeReview from "./CodeReview";
import LiveInvestigation from "./LiveInvestigation";
import ReplayStage from "./ReplayStage";
import "./room.css";

const RECORD_TABS = [
  ["incident", "Incidents"],
  ["hypothesis", "Hypotheses"],
  ["claim", "Claims"],
  ["experiment", "Experiments"],
  ["patch", "Patches"],
  ["verdict", "Verdicts"],
  ["browser", "Browsers"],
];

const GOOD = ["observed", "supported", "supports", "verified", "fix_verified", "approved", "pass"];
const BAD = ["contradicted", "refuted", "refutes", "rejected", "fail"];
const WARN = ["unresolved", "inconclusive", "insufficient_evidence", "infra_failure", "confirmed_defect", "website_defect", "website_defect_network_trigger", "browser_specific", "environment_specific", "not_reproduced"];

const who = (name) => AGENTS[name] || (name === "human" ? HUMAN : { label: name, short: "··", color: "#5B6B82", role: "" });
const sentence = (s) => { const t = String(s || "").replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const clock = (ts) => { try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } };
const tone = (v) => (GOOD.includes(v) ? "good" : BAD.includes(v) ? "bad" : WARN.includes(v) ? "warn" : "plain");

function Avatar({ name }) {
  const a = who(name);
  return <span className={`avatar ${name === "human" ? "human" : ""}`} style={{ "--agent": a.color }} aria-hidden="true">{a.short}</span>;
}

function Pill({ value }) {
  if (!value) return null;
  return <span className={`pill ${tone(value)}`}>{sentence(value)}</span>;
}

function RefChip({ id, onOpen }) {
  const known = recordTypeForRef(id) || /^(APR|MSG)-/.test(id);
  if (!known) return <span className="chip inert">{id}</span>;
  return <button className="chip" onClick={() => onOpen(id)} title={`Show ${id}`}>{id}</button>;
}

function Refs({ ids, onOpen }) {
  if (!ids || !ids.length) return null;
  return <span className="refs">{ids.map((r) => <RefChip key={r} id={r} onOpen={onOpen} />)}</span>;
}

const PHASE_LABELS = ["Intake", "Correlate", "Reproduce", "Fix", "Verify", "Release prep"];

function phaseForEventRows(rows, matcher) {
  const match = [...rows].reverse().find((row) => matcher(row.event));
  return match ? match.phase : null;
}

function PhaseTimeline({ phases, selectedPhase, currentStage, followLive, phaseEventCount, reason, direction, onSelect, onFollow }) {
  const currentIndex = STAGES.findIndex((stage) => stage.id === currentStage);
  const selectedIndex = STAGES.findIndex((stage) => stage.id === selectedPhase);
  const phase = STAGES[selectedIndex] || STAGES[0];
  const handleKeyDown = (event) => {
    const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement);
    let next = current;
    if (event.key === "ArrowRight") next = Math.min(buttons.length - 1, Math.max(current, 0) + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, (current < 0 ? 0 : current) - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
    buttons[next]?.click();
  };

  return (
    <section className="phase-navigator" aria-label="Investigation progress">
      <div className="phase-tabs" role="tablist" aria-label="Investigation phases" onKeyDown={handleKeyDown}>
        {STAGES.map((stage, index) => {
          const visited = phases.has(stage.id) || index === currentIndex;
          const isCurrent = stage.id === currentStage;
          const selected = stage.id === selectedPhase;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={!visited ? "true" : undefined}
              disabled={!visited}
              className={`phase-tab${selected ? " selected" : ""}${isCurrent ? " current" : ""}${visited ? " visited" : " future"}`}
              onClick={() => onSelect(stage.id)}
            >
              <span className="phase-tab-id">{visited && !isCurrent ? "✓" : stage.id}</span>
              <span className="phase-tab-label">{PHASE_LABELS[index] || stage.name}</span>
            </button>
          );
        })}
      </div>
      <div className="phase-summary">
        <div className={`phase-summary-copy slide-${direction}`} key={selectedPhase}>
          <span className="eyebrow">{selectedPhase === currentStage ? (followLive ? "Current phase" : "Current phase · paused") : "Phase snapshot"}</span>
          <strong><span>{phase.id}</span>{PHASE_LABELS[selectedIndex] || phase.name}</strong>
          <small>{reason || "Investigation activity"} · {phaseEventCount} {phaseEventCount === 1 ? "event" : "events"}</small>
        </div>
        {!followLive || selectedPhase !== currentStage ? (
          <button className="follow-button" type="button" onClick={onFollow}>Follow current <span aria-hidden="true">↗</span></button>
        ) : <span className="phase-current-mark"><i /> Following current</span>}
      </div>
    </section>
  );
}

/* ------------------------------ feed items ------------------------------ */

function MessageItem({ e, onOpen }) {
  const a = who(e.from);
  const pushback = PUSHBACK_TYPES.includes(e.type);
  const to = (e.to || []).map((t) => (t === "team" ? "everyone" : who(t).label)).join(", ");
  return (
    <article className={`msg ${pushback ? "pushback" : ""} ${e.type === "BLOCKED_INFRA" ? "infra" : ""}`} style={{ "--agent": a.color }} id={e.id ? `msg-${e.id}` : undefined}>
      <Avatar name={e.from} />
      <div className="msg-main">
        <header>
          <strong>{e.from === "human" && e.actor ? e.actor : a.label}</strong>
          <span className="to">to {to}</span>
          {e.cc && e.cc.length ? <span className="to">cc {e.cc.map((c) => who(c).label).join(", ")}</span> : null}
          <span className={`type ${pushback ? "pushback" : ""}`}>{sentence(e.type)}</span>
          <time>{clock(e.ts)}</time>
        </header>
        <p>{e.body}</p>
        {(e.refs && e.refs.length) || (e.artifacts && e.artifacts.length) ? (
          <footer>
            <Refs ids={e.refs} onOpen={onOpen} />
            {(e.artifacts || []).map((p) => <code key={p} className="artifact">{p}</code>)}
          </footer>
        ) : null}
        {e.requires_response ? <span className="needs">Needs a response</span> : null}
      </div>
    </article>
  );
}

function ActivityItem({ e }) {
  const agent = who(e.from);
  const data = e.data || {};
  const status = data.status || "idle";
  return (
    <article className={`activity-card is-${status}`} style={{ "--agent": agent.color }}>
      <Avatar name={e.from} />
      <div className="activity-main">
        <header>
          <strong>{agent.label}</strong>
          <span className={`activity-status is-${status}`}>{sentence(status)}</span>
          <time>{clock(e.ts)}</time>
        </header>
        <p>{data.summary || `${agent.label} updated their status to ${sentence(status).toLowerCase()}.`}</p>
        {data.observation ? <details>
          <summary>Observation data</summary>
          <p>{data.observation}</p>
        </details> : null}
      </div>
    </article>
  );
}

function ApprovalItem({ e, approval, canDecide, onDecide, onReviewCode }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = approval && approval.decision;
  // Offer the diff only where a code change is actually on the table. Matching the
  // detail text is too loose: "a fix is in review" appears in the customer-reply
  // approval, which has no code to read.
  const wantsCodeReview = Boolean(onReviewCode) && (
    (e.data.refs || []).some((r) => /^PATCH-/i.test(String(r)))
    || /pull request|\bPR\b|\bdiff\b|\bmerge\b|\bbranch\b/i.test(e.data.title || "")
  );
  async function decide(decision) {
    setBusy(true);
    try {
      await onDecide(e.data.id, decision, note);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`approval ${d ? d.decision : "pending"}`} id={`apr-${e.data.id}`}>
      <header>
        <Avatar name={e.from} />
        <div>
          <strong>{e.data.title}</strong>
          <span className="to">{who(e.from).label} asks for sign-off, {e.data.id}</span>
        </div>
      </header>
      <p>{e.data.detail}</p>
      {d ? (
        <p className={`decided ${d.decision}`}>{sentence(d.decision)} by {d.actor}{d.note ? `: ${d.note}` : ""}</p>
      ) : canDecide ? (
        <div className="decide">
          {wantsCodeReview ? (
            <button type="button" className="btn review-code" onClick={onReviewCode}>
              Review the code
            </button>
          ) : null}
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Optional note for the record" aria-label="Note" />
          <button className="btn primary" disabled={busy} onClick={() => decide("approved")}>Approve</button>
          <button className="btn" disabled={busy} onClick={() => decide("rejected")}>Reject</button>
        </div>
      ) : (
        <p className="muted">Waiting for an approver.</p>
      )}
    </article>
  );
}

function FeedItem({ e, state, onOpen, canDecide, onDecide, simulated, onReviewCode }) {
  if (e.kind === "message") return <MessageItem e={e} onOpen={onOpen} />;
  if (e.kind === "activity") return <ActivityItem e={e} />;
  if (e.kind === "approval") {
    return <ApprovalItem e={e} approval={state.approvals.find((a) => a.id === e.data.id)} canDecide={canDecide} onDecide={onDecide} onReviewCode={onReviewCode} />;
  }
  if (e.kind === "stage") {
    const back = state.directions[e.seq] === "backward";
    const st = STAGES.find((s) => s.id === e.data.stage);
    return (
      <div className={`band ${back ? "back" : ""}`}>
        <strong>{back ? "Sent back to" : "Moved to"} {st ? st.name : e.data.stage}</strong>
        <span>{e.data.reason}</span>
        <Refs ids={e.data.refs} onOpen={onOpen} />
      </div>
    );
  }
  if (e.kind === "ledger") {
    const v = e.data.value || {};
    const text = v.statement || v.title || v.observed || v.root_cause || v.result || "";
    return (
      <div className="line" style={{ "--agent": who(e.from).color }}>
        <span className="dot" />
        <span>{who(e.from).label} wrote</span>
        <RefChip id={e.data.id} onOpen={onOpen} />
        {v.status || v.outcome || v.result ? <Pill value={v.status || v.outcome || v.result} /> : null}
        <span className="line-text">{text}</span>
      </div>
    );
  }
  if (e.kind === "tool") {
    return (
      <div className={`line tool ${e.data.status}`} style={{ "--agent": who(e.from).color }}>
        <span className="dot" />
        <span>{who(e.from).label}, {e.data.tool}</span>
        <span className="line-text">{e.data.summary}</span>
        {e.data.status === "error" ? <Pill value="infra_failure" /> : null}
      </div>
    );
  }
  if (e.kind === "browser") {
    const d = e.data;
    const verb = d.status === "open" ? "opened" : d.status === "failed" ? "lost" : "closed";
    return (
      <div className={`line ${d.status === "failed" ? "tool error" : ""}`} style={{ "--agent": who(e.from).color }}>
        <span className="dot" />
        <span>{who(e.from).label} {verb} {simulated ? "a sample browser fixture" : `a ${d.provider === "local" ? "local" : "cloud"} browser`}</span>
        <button className="chip" onClick={() => onOpen(`BROWSER:${d.session_id}`)}>{d.env || "session"}{d.run ? `, run ${d.run}` : ""}</button>
        {d.experiment ? <RefChip id={d.experiment} onOpen={onOpen} /> : null}
        <span className="line-text">{d.outcome || d.target}</span>
      </div>
    );
  }
  if (e.kind === "decision") {
    return <div className="line"><span className="dot" /><span>{e.data.actor} {e.data.decision} {e.data.approval}</span></div>;
  }
  if (e.kind === "system" && e.type === "REJECTED") {
    return (
      <div className="band bad">
        <strong>Write refused</strong>
        <span>From {who(e.data && e.data.sender).label}: {e.body}</span>
      </div>
    );
  }
  return <div className="band quiet"><strong>{sentence(e.type)}</strong><span>{e.body}</span></div>;
}

/* ------------------------------ ledger panel ------------------------------ */

function Field({ label, children, wide }) {
  if (children === undefined || children === null || children === "" || (Array.isArray(children) && !children.length)) return null;
  return <div className={`field ${wide ? "wide" : ""}`}><dt>{label}</dt><dd>{children}</dd></div>;
}

function Record({ type, rec, focused, onOpen }) {
  const list = (arr) => (Array.isArray(arr) && arr.length ? <Refs ids={arr.map(String)} onOpen={onOpen} /> : null);
  const kv = (obj) => (obj && typeof obj === "object" ? Object.entries(obj).map(([k, v]) => `${sentence(k)}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ") : obj);
  let head = rec.title || rec.statement || rec.branch || rec.observed || rec.patch || "";
  const status = rec.status || rec.outcome || rec.result;
  return (
    <li className={`record ${focused ? "focused" : ""}`} id={`rec-${rec.id}`}>
      <header>
        <code>{rec.id}</code>
        <Pill value={status} />
        <span className="by">{who(rec._by).label}</span>
      </header>
      <p className={type === "patch" ? "mono" : ""}>{head}</p>
      <dl>
        {type === "claim" ? <>
          <Field label="Source">{rec.source ? `${sentence(rec.source.kind)}, ${rec.source.ref || ""}${rec.source.author ? ` (${rec.source.author})` : ""}` : null}</Field>
          <Field label="Not known">{(rec.missing_fields || []).join(", ")}</Field>
          <Field label="Contradicts">{list(rec.contradicts)}</Field>
          <Field label="Evidence">{list(rec.evidence)}</Field>
        </> : null}
        {type === "incident" ? <>
          <Field label="Tickets">{(rec.tickets || []).join(", ")}</Field>
          <Field label="Matched on">{sentence(rec.match_basis)}</Field>
          <Field label="Kept separate">{rec.excluded_from}</Field>
          <Field label="Unresolved">{(rec.unresolved_tickets || []).join(", ")}</Field>
          <Field label="Needs">{(rec.needs || []).join(", ")}</Field>
        </> : null}
        {type === "hypothesis" ? <>
          <Field label="Incident">{list(rec.incident ? [rec.incident] : [])}</Field>
          <Field label="Predicts">{rec.predicts}</Field>
          <Field label="Refuted if">{rec.would_be_refuted_by}</Field>
          <Field label="Experiments">{list(rec.experiments)}</Field>
        </> : null}
        {type === "experiment" ? <>
          <Field label="Tests">{list(rec.hypothesis ? [rec.hypothesis] : [])}</Field>
          <Field label="Conditions">{kv(rec.conditions)}</Field>
          <Field label="Expected">{rec.expected_if_true}</Field>
          <Field label="Runs">{rec.runs}</Field>
          <Field label="Environments" wide>{Array.isArray(rec.matrix) && rec.matrix.length ? (
            <table className="matrix">
              <thead><tr><th>Environment</th><th>Network</th><th>Failed</th></tr></thead>
              <tbody>
                {rec.matrix.map((m, i) => (
                  <tr key={i} className={m.failed > 0 ? "hit" : ""}>
                    <td>{m.env}<span className="muted"> {m.provider}</span></td>
                    <td>{m.fault}</td>
                    <td>{m.failed}/{m.runs}{m.infra ? `, ${m.infra} infra` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}</Field>
          <Field label="Attribution" wide>{rec.attribution ? <><Pill value={rec.attribution.verdict} /> {rec.attribution.because}</> : null}</Field>
          <Field label="Artifacts">{(rec.artifacts || []).map((p) => <code key={p} className="artifact">{p}</code>)}</Field>
        </> : null}
        {type === "patch" ? <>
          <Field label="Root cause">{rec.root_cause}</Field>
          <Field label="Replaces">{list(rec.supersedes ? [rec.supersedes] : [])}</Field>
          <Field label="Answers">{list(rec.addresses_counterexamples)}</Field>
          <Field label="Diff">{rec.diff_path ? <code className="artifact">{rec.diff_path}</code> : null}</Field>
        </> : null}
        {type === "verdict" ? <>
          <Field label="Patch">{list(rec.patch ? [rec.patch] : [])}</Field>
          <Field label="Fails on main">{rec.regression_fails_on_base === undefined ? null : rec.regression_fails_on_base ? "Yes" : "No"}</Field>
          <Field label="Passes on branch">{rec.regression_passes_on_branch === undefined ? null : rec.regression_passes_on_branch ? "Yes" : "No"}</Field>
          <Field label="Existing suite">{sentence(rec.existing_suite)}</Field>
          <Field label="Attacks">{(rec.adversarial_cases || []).map((c) => <span key={c.name} className="case"><Pill value={c.result} /> {c.name}</span>)}</Field>
        </> : null}
      </dl>
    </li>
  );
}

/* ------------------------------ the room ------------------------------ */

export default function RunRoom({ runId, preview }) {
  const [me, setMe] = useState(preview ? preview.me : null);
  const [run, setRun] = useState(preview ? preview.run : null);
  const [events, setEvents] = useState(preview ? preview.events : []);
  const [conn, setConn] = useState("connecting");
  const [error, setError] = useState("");
  const [agentFilter, setAgentFilter] = useState(null);
  const [showActivity, setShowActivity] = useState(true);
  const [tab, setTab] = useState((preview && preview.tab) || "incident");
  const [focus, setFocus] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [watch, setWatch] = useState(null); // browser session pinned by the reader
  const [selectedPhase, setSelectedPhase] = useState("S0");
  const [followLive, setFollowLive] = useState(true);
  const [phaseDirection, setPhaseDirection] = useState("forward");
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState("");
  const [replayPaused, setReplayPaused] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayError, setReplayError] = useState("");
  const [replayDone, setReplayDone] = useState(false);
  const [replayRetry, setReplayRetry] = useState(0);

  const lastSeq = useRef(0);
  const feedRef = useRef(null);
  const stick = useRef(true);
  const previousStage = useRef(null);
  const selectedPhaseRef = useRef(selectedPhase);
  const currentStageRef = useRef("S0");
  const replayPausedRef = useRef(replayPaused);
  const replaySpeedRef = useRef(replaySpeed);
  selectedPhaseRef.current = selectedPhase;
  replayPausedRef.current = replayPaused;
  replaySpeedRef.current = replaySpeed;

  // who am I + initial load + live stream
  useEffect(() => {
    if (preview) return;
    let es;
    let timer;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetch("/api/me");
        if (m.status === 401) { window.location.href = `/login?next=/runs/${runId}`; return; }
        setMe(await m.json());
        const res = await fetch(`/api/runs/${runId}/events?after=0`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Could not load this run."); return; }
        if (cancelled) return;
        setRun(data.run);
        setEvents(data.events);
        const lastStage = [...data.events].reverse().find((event) => event.kind === "stage" && event.data && event.data.stage);
        currentStageRef.current = lastStage ? lastStage.data.stage : (data.run.stage || "S0");
        lastSeq.current = data.cursor;
        es = new EventSource(`/api/runs/${runId}/stream?after=${data.cursor}`);
        es.onopen = () => { clearTimeout(timer); setConn("live"); };
        es.onerror = () => { clearTimeout(timer); timer = setTimeout(() => setConn("reconnecting"), 3000); };
        es.onmessage = (msg) => {
          let e;
          try { e = JSON.parse(msg.data); } catch { return; }
          if (!e || e.seq <= lastSeq.current) return;
          lastSeq.current = e.seq;
          if (e.kind === "stage" && e.data && e.data.stage) currentStageRef.current = e.data.stage;
          setEvents((prev) => [...prev, e]);
          let eventPhase = currentStageRef.current;
          if (e.kind === "activity" && e.data && e.data.phase) eventPhase = e.data.phase;
          if (!stick.current && eventPhase === selectedPhaseRef.current) setUnseen((n) => n + 1);
        };
      } catch {
        setError("Could not reach the server. Reload to try again.");
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); if (es) es.close(); };
  }, [runId]);

  // The sample replay is paced locally; the fixture/API event order is unchanged.
  useEffect(() => {
    if (!run || !run.simulated || !me || me.role !== "approver") return;
    const controller = new AbortController();
    const { signal } = controller;
    let stopped = false;

    function wait(ms) {
      if (signal.aborted) return Promise.resolve(false);
      return new Promise((resolve) => {
        const timer = setTimeout(() => finish(true), ms);
        const onAbort = () => finish(false);
        function finish(value) {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        }
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    async function waitPausable(ms) {
      let remaining = Math.max(0, ms);
      let last = Date.now();
      while (remaining > 0 && !signal.aborted) {
        if (replayPausedRef.current) {
          await wait(120);
          last = Date.now();
          continue;
        }
        const speed = Math.max(1, replaySpeedRef.current);
        await wait(Math.min(120, remaining / speed));
        const now = Date.now();
        if (!replayPausedRef.current) remaining -= (now - last) * Math.max(1, replaySpeedRef.current);
        last = now;
      }
      return !signal.aborted;
    }

    (async () => {
      let index = run.demoIndex || 0;
      while (!stopped && !signal.aborted) {
        if (replayPausedRef.current) {
          await wait(120);
          continue;
        }
        const stageBefore = currentStageRef.current;
        let response;
        let data;
        try {
          response = await fetch(`/api/runs/${runId}/demo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index }),
            signal,
          });
          const text = await response.text();
          try { data = text ? JSON.parse(text) : {}; }
          catch { throw new Error("The replay service returned an unreadable response."); }
          if (!response.ok) throw new Error(data.error || "The sample replay could not continue.");
        } catch (cause) {
          if (signal.aborted) break;
          setReplayError(cause.message || "Could not reach the replay service.");
          return;
        }
        if (typeof data.index === "number") index = data.index;
        if (data.skipped) {
          if (data.done) { setReplayDone(true); return; }
          continue;
        }
        if (data.done) { setReplayDone(true); return; }
        setReplayError("");

        await wait(100);
        const phaseChanged = currentStageRef.current !== stageBefore;
        const jitter = 0.9 + Math.random() * 0.2;
        const baseDelay = Math.max(250, Number(data.nextDelay) || 700);
        const semanticPause = phaseChanged ? 2_000 + Math.random() * 1_000 : 0;
        if (!await waitPausable((baseDelay * 1.9 * jitter) + semanticPause)) break;
      }
    })().catch((cause) => {
      if (!signal.aborted) setReplayError(cause.message || "The sample replay stopped unexpectedly.");
    });
    return () => { stopped = true; controller.abort(); };
  }, [run && run.id, me && me.role, replayRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = useMemo(() => reduceEvents(events), [events]);
  const phaseEventRows = useMemo(() => {
    let currentStage = "S0";
    return events.map((event) => {
      if (event.kind === "stage" && event.data && event.data.stage) currentStage = event.data.stage;
      return {
        event,
        phase: event.kind === "activity" && event.data && event.data.phase ? event.data.phase : currentStage,
      };
    });
  }, [events]);
  const selectedPhaseEvents = useMemo(
    () => phaseEventRows.filter((row) => row.phase === selectedPhase).map((row) => row.event),
    [phaseEventRows, selectedPhase],
  );
  const visitedPhases = useMemo(() => new Set(phaseEventRows.map((row) => row.phase)), [phaseEventRows]);
  const phaseState = useMemo(() => reduceEvents(selectedPhaseEvents), [selectedPhaseEvents]);
  const liveRun = !!(run && run.mode === "live" && !run.simulated);
  const currentStage = state.stage || (run && run.stage) || "S0";
  currentStageRef.current = currentStage;
  const lifecycleEvent = [...events].reverse().find((event) => event.kind === "system" && ["RUN_FINISHED", "RUN_BLOCKED", "RUN_CANCELLED"].includes(event.type));
  const runTerminal = state.finished || ["finished", "blocked", "cancelled", "canceled"].includes(run && run.status) || !!lifecycleEvent;

  useEffect(() => {
    const next = currentStage;
    const previous = previousStage.current;
    const nextIndex = STAGES.findIndex((stage) => stage.id === next);
    const previousIndex = STAGES.findIndex((stage) => stage.id === previous);
    if (previous !== null && next !== previous && nextIndex >= 0 && previousIndex >= 0 && followLive) {
      setPhaseDirection(nextIndex < previousIndex ? "backward" : "forward");
      setSelectedPhase(next);
      selectedPhaseRef.current = next;
      stick.current = true;
      setUnseen(0);
    } else if (previous === null && next) {
      setSelectedPhase(next);
      selectedPhaseRef.current = next;
    }
    previousStage.current = next;
  }, [currentStage, followLive]);

  const visible = useMemo(() => selectedPhaseEvents.filter((e) => {
    if (!showActivity && (e.kind === "tool" || e.kind === "ledger")) return false;
    if (agentFilter && e.kind !== "stage") {
      const involved = e.from === agentFilter || (e.to || []).includes(agentFilter) || (e.cc || []).includes(agentFilter);
      if (!involved) return false;
    }
    return true;
  }), [selectedPhaseEvents, showActivity, agentFilter]);

  // keep the feed pinned to the newest message unless the reader scrolled up
  useEffect(() => {
    const el = feedRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else el.scrollTop = 0;
  }, [selectedPhase]);

  function onFeedScroll() {
    const el = feedRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setUnseen(0);
  }

  function jumpToLatest() {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setUnseen(0);
  }

  function changeSelectedPhase(phase, follow = false) {
    const previousIndex = STAGES.findIndex((stage) => stage.id === selectedPhaseRef.current);
    const nextIndex = STAGES.findIndex((stage) => stage.id === phase);
    if (nextIndex < 0) return;
    setPhaseDirection(nextIndex < previousIndex ? "backward" : "forward");
    setSelectedPhase(phase);
    setFollowLive(follow);
    selectedPhaseRef.current = phase;
    stick.current = follow;
    setUnseen(0);
  }

  function openRef(id) {
    let phase = null;
    if (id.startsWith("BROWSER:")) {
      const session = id.slice(8);
      phase = phaseForEventRows(phaseEventRows, (event) => event.kind === "browser" && event.data && event.data.session_id === session);
      if (phase) changeSelectedPhase(phase);
      setTab("browser");
      setWatch(session);
      return;
    }
    phase = phaseForEventRows(phaseEventRows, (event) => event.kind === "ledger" && event.data && event.data.id === id)
      || phaseForEventRows(phaseEventRows, (event) => (event.refs || []).includes(id)
        || (event.kind === "approval" && event.data && (event.data.id === id || (event.data.refs || []).includes(id)))
        || (event.data && (event.data.refs || []).includes(id)));
    if (phase) changeSelectedPhase(phase);
    const type = recordTypeForRef(id);
    if (type) setTab(type);
    setFocus(id);
  }

  useEffect(() => {
    if (!focus) return;
    const target = focus.startsWith("approval:") ? `apr-${focus.slice(9)}` : focus.startsWith("APR-") ? `apr-${focus}` : focus.startsWith("MSG-") ? `msg-${focus}` : `rec-${focus}`;
    const t = setTimeout(() => {
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [focus, tab, selectedPhase]);

  async function post(payload) {
    try {
      const res = await fetch(`/api/runs/${runId}/human`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "That did not go through."); return false; }
      setError("");
      return true;
    } catch {
      setError("Could not reach the server. Your message was not sent.");
      return false;
    }
  }

  async function sendDraft() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      if (await post({ mode: "message", body: draft })) { setDraft(""); stick.current = true; }
    } finally {
      setSending(false);
    }
  }

  const canAct = me && me.role === "approver";
  const pending = state.approvals.filter((a) => !a.decision);
  const records = Object.values(state.ledger[tab] || {}).sort((a, b) => a._firstSeq - b._firstSeq);
  const liveBrowser = run && run.simulated ? null : state.browsers.find((b) => b.session_id === watch && b.live_url) || state.browsers.find((b) => b.live_url);
  const observedClaims = Object.values(state.ledger.claim).filter((claim) => claim.status === "observed").length;
  const verifiedVerdicts = Object.values(state.ledger.verdict).filter((verdict) => verdict.result === "verified").length;
  const selectedStageEvent = [...selectedPhaseEvents].reverse().find((event) => event.kind === "stage" && event.data && event.data.stage === selectedPhase);
  const selectedPhaseReason = selectedStageEvent && selectedStageEvent.data.reason;

  function selectPhase(phase) {
    changeSelectedPhase(phase, false);
  }

  function resumeFollowing() {
    changeSelectedPhase(currentStage, true);
  }

  async function stopLiveRun() {
    if (!liveRun || !canAct || runTerminal || stopBusy) return;
    setStopBusy(true);
    setStopError("");
    try {
      const response = await fetch("/api/runs/" + runId + "/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not stop this run.");
      if (data.run) setRun((previous) => ({ ...previous, ...data.run }));
      setStopError("");
    } catch (reason) {
      setStopError(reason.message || "Could not reach the server. The run was not stopped.");
    } finally {
      setStopBusy(false);
    }
  }

  function focusApproval(id) {
    setAgentFilter(null);
    const phase = phaseForEventRows(phaseEventRows, (event) => event.kind === "approval" && event.data && event.data.id === id);
    if (phase) changeSelectedPhase(phase);
    setFocus(`approval:${id}`);
  }

  if (error && !run) {
    return <PatchShell active="investigations" title="Investigation" onCodeReview={() => setReviewOpen(true)} me={me}><main className="room-load-error"><p className="notice bad" role="alert">{error}</p><a className="btn" href="/">Back to investigations</a></main></PatchShell>;
  }

  return (
    <PatchShell active="investigations" title="Investigation" onNewReport={() => { window.location.href = "/?intake=1"; }} onCodeReview={() => setReviewOpen(true)} me={me}>
    {liveRun ? (
      <LiveInvestigation
        run={run}
        events={events}
        phaseEvents={selectedPhaseEvents}
        agents={state.agents}
        browsers={state.browsers}
        visitedPhases={visitedPhases}
        connection={conn}
        phase={selectedPhase}
        currentPhase={currentStage}
        followLive={followLive}
        direction={phaseDirection}
        canStop={!!canAct && !runTerminal}
        stopBusy={stopBusy}
        stopError={stopError}
        onSelectPhase={selectPhase}
        onFollowLive={resumeFollowing}
        onStop={stopLiveRun}
      />
    ) : null}
    <div className={"room" + (liveRun ? " room-live" : "") + (run && run.simulated ? " room-sample" : "")}>
      <header className="room-head">
        <div className="room-heading">
          <a href="/" className="back">← All investigations</a>
          <div className="room-title-row">
            <div className="room-title">
              <h1>{liveRun ? "Conversation & evidence" : run ? run.title : "Loading investigation"}</h1>
              <div className="room-meta">
                {!liveRun ? <span className={`conn ${conn}`}>{conn === "live" ? "Connected stream" : conn === "reconnecting" ? "Reconnecting" : "Connecting"}</span> : null}
                {run && run.simulated ? <span className="pill sim">Sample replay · no agents are running</span> : run && !liveRun ? <span>{run.workspace}</span> : null}
                {state.counts.rejected ? <span className="bad-text">{state.counts.rejected} writes refused</span> : null}
              </div>
            </div>
            <a className="audit-action" href={`/api/runs/${runId}/export`}>Export audit <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        {!liveRun ? <>
          <PhaseTimeline
            phases={visitedPhases}
            selectedPhase={selectedPhase}
            currentStage={currentStage}
            followLive={followLive}
            phaseEventCount={selectedPhaseEvents.length}
            reason={selectedPhaseReason}
            direction={phaseDirection}
            onSelect={selectPhase}
            onFollow={resumeFollowing}
          />
          <div className="room-toolbar">
            <div className="evidence-stats" aria-label="Evidence summary from the ledger">
              <span><strong>{Object.keys(state.ledger.experiment).length}</strong> experiments</span>
              <span><strong>{observedClaims}</strong> observations</span>
              <span><strong>{Object.keys(state.ledger.patch).length}</strong> patches</span>
              <span className={verifiedVerdicts ? "verified-stat" : ""}><strong>{verifiedVerdicts}</strong> verified verdicts</span>
            </div>
            {run && run.simulated ? <div className="replay-controls" aria-label="Sample replay controls">
              <span className="replay-state"><i />{replayDone ? "Replay complete" : replayPaused ? "Paused" : "Playing sample"}</span>
              <button type="button" className="replay-toggle" onClick={() => setReplayPaused((paused) => !paused)} disabled={replayDone} aria-label={replayPaused ? "Resume sample replay" : "Pause sample replay"}>
                <span aria-hidden="true">{replayPaused ? "▶" : "Ⅱ"}</span>{replayPaused ? "Resume" : "Pause"}
              </button>
              <div className="speed-control" aria-label="Sample replay speed">
                {[1, 2].map((speed) => <button key={speed} type="button" onClick={() => setReplaySpeed(speed)} aria-pressed={replaySpeed === speed}>{speed}×</button>)}
              </div>
            </div> : null}
          </div>
          {replayError ? <p className="replay-error" role="alert">{replayError}<button type="button" onClick={() => { setReplayError(""); setReplayDone(false); setReplayRetry((n) => n + 1); }}>Retry replay</button></p> : null}
        </> : null}
      </header>

      <aside className="roster" aria-label="Team">
        <button className={`member all ${agentFilter === null ? "on" : ""}`} onClick={() => setAgentFilter(null)} aria-pressed={agentFilter === null}>
          <span className="member-name">All activity</span>
        </button>
        {AGENT_GROUPS.map((group) => <section className="roster-group" key={group.label} aria-label={group.label}>
          <h2>{group.label}</h2>
          {group.agents.map((name) => {
            const a = AGENTS[name];
            const s = state.agents[name];
            return (
              <button key={name} className={`member ${agentFilter === name ? "on" : ""}`} onClick={() => setAgentFilter(agentFilter === name ? null : name)} style={{ "--agent": a.color }} aria-pressed={agentFilter === name}>
                <Avatar name={name} />
                <span className="member-text">
                <span className="member-name">{a.label}{s.busy && !(run && run.simulated) ? <span className="working" aria-label="working" /> : null}</span>
                <span className="member-role">{s.busy && s.lastTool && !(run && run.simulated) ? s.lastTool.summary : `${a.role} · ${a.model}`}</span>
                </span>
              </button>
            );
          })}
        </section>)}
        <label className="toggle">
          <input type="checkbox" checked={showActivity} onChange={(e) => setShowActivity(e.target.checked)} />
          Show ledger and tool activity
        </label>
      </aside>

      <section className="chat" aria-label="Team conversation">
        <div className="panel-head feed-head">
          <div><span className="eyebrow">Conversation</span><h2>{agentFilter ? who(agentFilter).label : "Swarm activity"}</h2></div>
          <span className="activity-count">{visible.length} {visible.length === 1 ? "event" : "events"}</span>
        </div>
        <div className={`feed phase-feed slide-${phaseDirection}`} key={selectedPhase} ref={feedRef} onScroll={onFeedScroll} aria-live="polite">
          {run && run.simulated ? <ReplayStage phase={selectedPhase} events={selectedPhaseEvents} ledger={phaseState.ledger} /> : null}
          {visible.length === 0 ? (
            <div className="empty">
              <span className="empty-mark">✳</span>
              <h2>{selectedPhaseEvents.length ? "No activity from this agent" : "Waiting for this phase"}</h2>
              <p>{selectedPhaseEvents.length ? "Choose All activity to return to this phase’s full stream." : "Phase activity will appear here as the investigation progresses."}</p>
            </div>
          ) : null}
          {visible.map((e) => <FeedItem key={e.seq} e={e} state={state} onOpen={openRef} canDecide={canAct} simulated={!!(run && run.simulated)} onDecide={(id, decision, note) => post({ mode: "decision", approval: id, decision, note })} onReviewCode={() => setReviewOpen(true)} />)}
        </div>
        {unseen ? <button className="jump" onClick={jumpToLatest}>{unseen} new, jump to latest</button> : null}
        {error ? <p className="notice bad" role="alert">{error}</p> : null}
        <div className="composer">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            disabled={!canAct || (run && run.simulated)}
            placeholder={run && run.simulated ? "This is a replay, so the team cannot answer." : canAct ? "Add a new report or an instruction. It goes to the incident lead as new evidence." : "Viewers can watch but not post."}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendDraft(); }}
            aria-label="Message to the team"
          />
          <button className="btn primary" onClick={sendDraft} disabled={sending || !draft.trim() || !canAct || (run && run.simulated)}>Send to the team</button>
        </div>
      </section>

      <aside className="ledger" aria-label="Evidence ledger">
        <div className="panel-head evidence-head"><div><span className="eyebrow">Investigation record</span><h2>Evidence &amp; handoff</h2></div><span className="ledger-total">{Object.values(state.ledger).reduce((n, group) => n + Object.keys(group).length, 0)} records</span></div>
        {pending.length ? (
          <div className="pending">
            <strong>{pending.length} waiting for sign-off</strong>
            {pending.map((a) => <button key={a.id} className="pending-link" onClick={() => focusApproval(a.id)}><span>{a.id}</span>{a.title}<span aria-hidden="true">↗</span></button>)}
          </div>
        ) : null}
        <div className="tabs" role="tablist">
          {RECORD_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label} <span className="count">{id === "browser" ? state.browsers.length : Object.keys(state.ledger[id]).length}</span>
            </button>
          ))}
        </div>
        {tab === "browser" ? (
          <div className="browsers">
            {liveBrowser ? (
              <figure className="liveview">
                <iframe src={liveBrowser.live_url} title={`Live browser, ${liveBrowser.env}`} sandbox="allow-same-origin allow-scripts" allow="clipboard-read; clipboard-write" />
                <figcaption><span className="conn live">Live</span> {who(liveBrowser.from).label}, {liveBrowser.env}{liveBrowser.experiment ? `, ${liveBrowser.experiment}` : ""}. View only.</figcaption>
              </figure>
            ) : (
              <div className="browser-empty"><span aria-hidden="true">◉</span><strong>{run && run.simulated ? "Sample browser history" : state.browsers.length ? "No live browser session" : "No browser sessions yet"}</strong><p>{run && run.simulated ? "These fixture entries are illustrative and are not live browser sessions." : state.browsers.length ? "Finished sessions appear below with their recordings." : "Execution and verification browser sessions will appear here when opened."}</p></div>
            )}
            <ul className="records">
              {state.browsers.map((b) => (
                <li key={b.session_id} className={`record ${watch === b.session_id ? "focused" : ""}`}>
                  <header>
                    <code>{b.experiment || "session"}{b.run ? ` run ${b.run}` : ""}</code>
                    <Pill value={run && run.simulated ? "sample" : b.status === "open" ? "running" : b.status === "failed" ? "infra_failure" : "closed"} />
                    <span className="by">{who(b.from).label}</span>
                  </header>
                  <p>{b.env}</p>
                  <dl>
                    <Field label="Setup">{b.env_detail}</Field>
                    <Field label="Where">{run && run.simulated ? `Sample fixture · ${b.provider === "local" ? "local browser" : "cloud browser"}` : b.provider === "local" ? "Local Playwright" : "Browserbase cloud"}</Field>
                    <Field label="Target">{b.target}</Field>
                    <Field label="Observed">{b.outcome}</Field>
                    <Field label="Recording">{b.replay_url ? <a href={b.replay_url} target="_blank" rel="noreferrer">Open session recording</a> : null}</Field>
                  </dl>
                  {b.live_url && !(liveBrowser && liveBrowser.session_id === b.session_id) ? <button className="btn" onClick={() => setWatch(b.session_id)}>Watch this one</button> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="records" hidden={tab === "browser"}>
          {records.length === 0 && tab !== "browser" ? <li className="muted pad">No {RECORD_TABS.find(([id]) => id === tab)[1].toLowerCase()} written yet.</li> : null}
          {records.map((rec) => <Record key={rec.id} type={tab} rec={rec} focused={focus === rec.id} onOpen={openRef} />)}
        </ul>
      </aside>
    </div>
      <CodeReview runId={runId} open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </PatchShell>
  );
}
