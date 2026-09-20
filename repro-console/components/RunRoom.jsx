"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, HUMAN, STAGES, PUSHBACK_TYPES, recordTypeForRef } from "@/lib/agents";
import { reduceEvents } from "@/lib/reduce";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

function ApprovalItem({ e, approval, canDecide, onDecide }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = approval && approval.decision;
  async function decide(decision) {
    setBusy(true);
    await onDecide(e.data.id, decision, note);
    setBusy(false);
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

function FeedItem({ e, state, onOpen, canDecide, onDecide }) {
  if (e.kind === "message") return <MessageItem e={e} onOpen={onOpen} />;
  if (e.kind === "approval") {
    return <ApprovalItem e={e} approval={state.approvals.find((a) => a.id === e.data.id)} canDecide={canDecide} onDecide={onDecide} />;
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
        <span>{who(e.from).label} {verb} a {d.provider === "local" ? "local" : "cloud"} browser</span>
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [watch, setWatch] = useState(null); // browser session pinned by the reader

  const lastSeq = useRef(0);
  const feedRef = useRef(null);
  const stick = useRef(true);

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
        lastSeq.current = data.cursor;
        es = new EventSource(`/api/runs/${runId}/stream?after=${data.cursor}`);
        es.onopen = () => { clearTimeout(timer); setConn("live"); };
        es.onerror = () => { clearTimeout(timer); timer = setTimeout(() => setConn("reconnecting"), 3000); };
        es.onmessage = (msg) => {
          let e;
          try { e = JSON.parse(msg.data); } catch { return; }
          if (!e || e.seq <= lastSeq.current) return;
          lastSeq.current = e.seq;
          setEvents((prev) => [...prev, e]);
          if (!stick.current) setUnseen((n) => n + 1);
        };
      } catch {
        setError("Could not reach the server. Reload to try again.");
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); if (es) es.close(); };
  }, [runId]);

  // drive the simulated replay from this tab
  useEffect(() => {
    if (!run || !run.simulated || !me || me.role !== "approver") return;
    let stop = false;
    (async () => {
      let index = run.demoIndex || 0;
      while (!stop) {
        const res = await fetch(`/api/runs/${runId}/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.done) break;
        if (typeof d.index === "number") index = d.index;
        await sleep(d.nextDelay || 700);
      }
    })();
    return () => { stop = true; };
  }, [run && run.id, me && me.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = useMemo(() => reduceEvents(events), [events]);

  const visible = useMemo(() => events.filter((e) => {
    if (!showActivity && (e.kind === "tool" || e.kind === "ledger")) return false;
    if (agentFilter && e.kind !== "stage") {
      const involved = e.from === agentFilter || (e.to || []).includes(agentFilter) || (e.cc || []).includes(agentFilter);
      if (!involved) return false;
    }
    return true;
  }), [events, showActivity, agentFilter]);

  // keep the feed pinned to the newest message unless the reader scrolled up
  useEffect(() => {
    const el = feedRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

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

  function openRef(id) {
    if (id.startsWith("BROWSER:")) { setTab("browser"); setWatch(id.slice(8)); return; }
    const type = recordTypeForRef(id);
    if (type) setTab(type);
    setFocus(id);
  }

  useEffect(() => {
    if (!focus) return;
    const target = focus.startsWith("APR-") ? `apr-${focus}` : focus.startsWith("MSG-") ? `msg-${focus}` : `rec-${focus}`;
    const t = setTimeout(() => {
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [focus, tab]);

  async function post(payload) {
    const res = await fetch(`/api/runs/${runId}/human`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "That did not go through."); return false; }
    setError("");
    return true;
  }

  async function sendDraft() {
    if (!draft.trim()) return;
    setSending(true);
    if (await post({ mode: "message", body: draft })) { setDraft(""); stick.current = true; }
    setSending(false);
  }

  const canAct = me && me.role === "approver";
  const pending = state.approvals.filter((a) => !a.decision);
  const stageIdx = STAGES.findIndex((s) => s.id === state.stage);
  const records = Object.values(state.ledger[tab] || {}).sort((a, b) => a._firstSeq - b._firstSeq);
  const liveBrowser = state.browsers.find((b) => b.session_id === watch && b.live_url) || state.browsers.find((b) => b.live_url);

  if (error && !run) {
    return <main className="home"><p className="notice bad" role="alert">{error}</p><a className="btn" href="/">Back to investigations</a></main>;
  }

  return (
    <div className="room">
      <header className="room-head">
        <div className="room-title">
          <a href="/" className="back">Investigations</a>
          <h1>{run ? run.title : "Loading run"}</h1>
          <div className="room-meta">
            <span className={`conn ${conn}`}>{conn === "live" ? "Live" : conn === "reconnecting" ? "Reconnecting" : "Connecting"}</span>
            {run && run.simulated ? <span className="pill sim">Simulated replay, no agents are running</span> : run ? <span className="pill">{run.workspace}</span> : null}
            <span>{state.counts.events} events</span>
            <span>{state.counts.pushbacks} challenges and pushbacks</span>
            {state.counts.rejected ? <span className="bad-text">{state.counts.rejected} writes refused</span> : null}
            <a href={`/api/runs/${runId}/export`}>Download audit record</a>
          </div>
        </div>
        <ol className="rail" aria-label="Pipeline stage">
          {STAGES.map((s, i) => (
            <li key={s.id} className={i < stageIdx ? "done" : i === stageIdx ? "now" : ""} aria-current={i === stageIdx ? "step" : undefined}>
              <span className="rail-n">{i + 1}</span>
              <span>{s.name}</span>
            </li>
          ))}
          {state.counts.sentBack ? <li className="rail-back">Sent back {state.counts.sentBack} {state.counts.sentBack === 1 ? "time" : "times"}</li> : null}
        </ol>
      </header>

      <aside className="roster" aria-label="Team">
        <button className={`member all ${agentFilter === null ? "on" : ""}`} onClick={() => setAgentFilter(null)}>
          <span className="member-name">Whole team</span>
        </button>
        {Object.entries(AGENTS).map(([name, a]) => {
          const s = state.agents[name];
          return (
            <button key={name} className={`member ${agentFilter === name ? "on" : ""}`} onClick={() => setAgentFilter(agentFilter === name ? null : name)} style={{ "--agent": a.color }} aria-pressed={agentFilter === name}>
              <Avatar name={name} />
              <span className="member-text">
                <span className="member-name">{a.label}{s.busy ? <span className="working" aria-label="working" /> : null}</span>
                <span className="member-role">{s.busy && s.lastTool ? s.lastTool.summary : `${a.model || a.role}, ${s.messages} sent`}</span>
              </span>
            </button>
          );
        })}
        <label className="toggle">
          <input type="checkbox" checked={showActivity} onChange={(e) => setShowActivity(e.target.checked)} />
          Show ledger writes and tool activity
        </label>
      </aside>

      <section className="chat" aria-label="Team conversation">
        <div className="feed" ref={feedRef} onScroll={onFeedScroll} aria-live="polite">
          {visible.length === 0 ? (
            <div className="empty">
              <h2>{events.length ? "Nothing from this agent yet" : "Waiting for the team"}</h2>
              <p>{events.length ? "Pick Whole team to see everything." : "Messages appear here the moment the agent runtime posts them."}</p>
            </div>
          ) : null}
          {visible.map((e) => <FeedItem key={e.seq} e={e} state={state} onOpen={openRef} canDecide={canAct} onDecide={(id, decision, note) => post({ mode: "decision", approval: id, decision, note })} />)}
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
        {pending.length ? (
          <div className="pending">
            <strong>{pending.length} waiting for sign-off</strong>
            {pending.map((a) => <button key={a.id} className="chip" onClick={() => setFocus(a.id)}>{a.id}: {a.title}</button>)}
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
              <p className="muted pad">{state.browsers.length ? "No browser is open right now. Finished sessions are listed below with their recordings." : "When the QA engineer or the verifier opens a browser, you can watch it here."}</p>
            )}
            <ul className="records">
              {state.browsers.map((b) => (
                <li key={b.session_id} className={`record ${watch === b.session_id ? "focused" : ""}`}>
                  <header>
                    <code>{b.experiment || "session"}{b.run ? ` run ${b.run}` : ""}</code>
                    <Pill value={b.status === "open" ? "running" : b.status === "failed" ? "infra_failure" : "closed"} />
                    <span className="by">{who(b.from).label}</span>
                  </header>
                  <p>{b.env}</p>
                  <dl>
                    <Field label="Setup">{b.env_detail}</Field>
                    <Field label="Where">{b.provider === "local" ? "Local Playwright" : "Browserbase cloud"}</Field>
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
  );
}
