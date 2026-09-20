"use client";

import { useState } from "react";
import PatchIcon from "@/components/PatchIcon";
import { AGENTS } from "@/lib/agents";
import { liveReviewDetails } from "@/lib/live-review";
import "./live-investigation.css";

const PHASES = [
  { id: "S0", label: "Intake" },
  { id: "S1", label: "Plan" },
  { id: "S2", label: "Reproduce" },
  { id: "S3", label: "Fix" },
  { id: "S4", label: "Verify" },
  { id: "S5", label: "Review" },
];

const INSPECTOR_TABS = [
  { id: "qa-engineer", label: "Execution", agents: ["qa-engineer"] },
  { id: "incident-lead", label: "Supervisor", agents: ["incident-lead"] },
  { id: "sre-analyst", label: "Incidents", agents: ["sre-analyst"] },
  { id: "support-engineer", label: "Customer", agents: ["support-engineer"] },
  { id: "implementation", label: "Implementation", agents: ["software-engineer", "release-verifier"] },
];

const STATUS_LABELS = {
  thinking: "Thinking",
  acting: "Acting",
  observing: "Observing",
  done: "Complete",
  blocked: "Blocked",
  idle: "Waiting",
};

function sentence(value) {
  return String(value || "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function captureTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusTone(status) {
  if (status === "acting" || status === "thinking" || status === "observing") return "working";
  if (status === "blocked") return "blocked";
  if (status === "done") return "done";
  return "waiting";
}

function normalizeActivity(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === "object" ? row.data : row;
  return {
    ...data,
    seq: row.seq || data.seq || 0,
    ts: row.ts || data.ts || "",
    phase: data.phase || row.phase || "",
  };
}

function activityForAgent(agentId, phaseEvents, agentState, phase) {
  const fromEvents = phaseEvents
    .filter((event) => event.kind === "activity" && event.from === agentId)
    .map((event) => normalizeActivity({ ...event.data, seq: event.seq, ts: event.ts }));

  const history = Array.isArray(agentState && agentState.activityHistory) ? agentState.activityHistory : [];
  const matchingHistory = history
    .map(normalizeActivity)
    .filter((activity) => activity && activity.phase === phase);
  const current = normalizeActivity(agentState && agentState.activity);
  const activity = fromEvents[fromEvents.length - 1]
    || matchingHistory[matchingHistory.length - 1]
    || (current && (!current.phase || current.phase === phase) ? current : null);
  if (activity) {
    return {
      status: STATUS_LABELS[activity.status] ? activity.status : "idle",
      summary: String(activity.summary || "").slice(0, 500),
      observation: String(activity.observation || "").slice(0, 6000),
      step: activity.step,
      model: activity.model || (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
      ts: activity.ts,
      source: "activity",
    };
  }

  const event = [...phaseEvents].reverse().find((item) => item.from === agentId && ["tool", "browser", "ledger", "message"].includes(item.kind));
  if (!event) {
    return {
      status: "idle",
      summary: "",
      observation: "",
      model: (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
      source: "waiting",
    };
  }

  if (event.kind === "tool") {
    const toolStatus = event.data && event.data.status;
    return {
      status: toolStatus === "error" ? "blocked" : toolStatus === "start" ? "acting" : "done",
      summary: [event.data && event.data.tool, event.data && event.data.summary].filter(Boolean).join(" · ").slice(0, 500),
      observation: "",
      model: (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
      ts: event.ts,
      source: "tool",
    };
  }
  if (event.kind === "browser") {
    const data = event.data || {};
    return {
      status: data.status === "failed" ? "blocked" : data.status === "open" ? "observing" : "done",
      summary: String(data.action || (data.status === "open" ? "Opened a browser session." : data.status === "failed" ? "Browser session failed." : "Closed a browser session.")).slice(0, 500),
      observation: String(data.outcome || "").slice(0, 6000),
      step: data.step,
      model: (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
      ts: event.ts,
      source: "browser",
    };
  }
  if (event.kind === "ledger") {
    const data = event.data || {};
    return {
      status: "done",
      summary: "Recorded " + sentence(data.record || "evidence") + (data.id ? " · " + data.id : ""),
      observation: "",
      model: (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
      ts: event.ts,
      source: "ledger",
    };
  }
  return {
    status: "done",
    summary: "Shared an update with the investigation team.",
    observation: "",
    model: (AGENTS[agentId] && AGENTS[agentId].model) || "Runtime unavailable",
    ts: event.ts,
    source: "message",
  };
}

function browsersFromEvents(events) {
  const sessions = new Map();
  for (const event of events) {
    if (event.kind !== "browser" || !event.data || !event.data.session_id) continue;
    const previous = sessions.get(event.data.session_id) || { session_id: event.data.session_id, from: event.from, firstSeq: event.seq };
    const next = { ...previous };
    for (const [key, value] of Object.entries(event.data)) {
      if (value !== undefined && value !== "") next[key] = value;
    }
    next.lastSeq = event.seq || previous.lastSeq || 0;
    next.lastTs = event.ts || previous.lastTs || "";
    if (next.status !== "open") next.live_url = undefined;
    sessions.set(event.data.session_id, next);
  }
  return [...sessions.values()].sort((left, right) => right.lastSeq - left.lastSeq);
}

function safeBrowserbaseUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    const allowlisted = url.hostname === "browserbase.com" || url.hostname.endsWith(".browserbase.com");
    return url.protocol === "https:" && allowlisted ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeArtifactUrl(value, runId) {
  if (typeof value !== "string" || !runId) return "";
  const expectedPrefix = "/api/runs/" + encodeURIComponent(runId) + "/artifacts/";
  if (value.startsWith(expectedPrefix)) return value;
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith(expectedPrefix)
      ? url.pathname + url.search
      : "";
  } catch {
    return "";
  }
}

function PhaseTimeline({ phase, currentPhase, followLive, events, onSelectPhase, onFollowLive, direction }) {
  const selectedIndex = PHASES.findIndex((item) => item.id === phase);
  const currentIndex = PHASES.findIndex((item) => item.id === currentPhase);
  const selected = PHASES[selectedIndex] || PHASES[0];
  const phaseEventCount = events.length;
  let announcement;
  if (phase !== currentPhase) announcement = "Showing the " + selected.label + " phase snapshot.";
  else if (followLive) announcement = "Following live. Current phase: " + selected.label + ".";
  else announcement = "Showing current phase: " + selected.label + ". Follow live is paused.";

  return (
    <div className="live-phase-bar">
      <div className="live-phase-tabs" role="tablist" aria-label="Investigation phases">
        {PHASES.map((item, index) => {
          const current = item.id === currentPhase;
          const selectedTab = item.id === phase;
          const future = index > currentIndex;
          const completed = index < currentIndex;
          return (
            <button
              type="button"
              role="tab"
              key={item.id}
              className={"live-phase-tab" + (selectedTab ? " is-selected" : "") + (current ? " is-current" : "") + (completed ? " is-complete" : "") + (future ? " is-future" : "")}
              aria-selected={selectedTab}
              aria-current={current ? "step" : undefined}
              aria-disabled={future ? "true" : undefined}
              disabled={future}
              onClick={() => onSelectPhase(item.id)}
            >
              <span className="live-phase-index">{completed ? "✓" : item.id}</span>
              <span>{item.label}</span>
              {current ? <i className="live-phase-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <div className="live-phase-actions">
        {!followLive ? <button type="button" className="live-follow-button" onClick={onFollowLive}><PatchIcon name="activity" size={14} />Follow live</button> : null}
        <span className={"live-phase-view-tag" + (phase === currentPhase ? " is-live" : "")}>{phase === currentPhase ? "Current phase" : "Phase snapshot"}</span>
      </div>
      <span className="live-phase-announcement" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div key={phase} className={"live-phase-summary slide-" + direction} aria-live="off">
        <span className="live-phase-summary-name">{selected.label}</span>
        <span>{phase === currentPhase ? (followLive ? "Following live activity" : "Live following paused") : "Snapshot · " + phaseEventCount + (phaseEventCount === 1 ? " event" : " events")}</span>
      </div>
    </div>
  );
}

function BrowserPane({ run, phase, currentPhase, phaseEvents, events, browsers, terminal }) {
  const isCurrentPhase = phase === currentPhase;
  const selectedBrowsers = isCurrentPhase ? browsersFromEvents(events) : browsersFromEvents(phaseEvents);
  const browser = selectedBrowsers[0] || null;
  const liveUrl = isCurrentPhase && !terminal && browser && browser.status === "open"
    ? safeBrowserbaseUrl(browser.live_url)
    : "";
  const screenshotUrl = browser ? safeArtifactUrl(browser.screenshot_url, run.id) : "";
  const captureTimeLabel = browser && captureTime(browser.lastTs || browser.ts || browser.last_updated);
  const targetUrl = (browser && (browser.current_url || browser.url)) || run.targetUrl || run.target_url || "";
  const provider = (browser && browser.provider) || run.provider || "";
  const providerLabel = provider === "local" ? "Local browser" : provider === "browserbase" ? "Browserbase" : provider ? sentence(provider) : "Browser pending";
  const step = browser && browser.step !== undefined && browser.step !== null && Number.isFinite(Number(browser.step))
    ? Number(browser.step)
    : null;

  let emptyTitle = "Waiting for the runtime to start a browser.";
  let emptyCopy = "The current run has not reported a browser capture yet.";
  if (browser && browser.status === "failed") {
    emptyTitle = "Browser session failed.";
    emptyCopy = browser.outcome || "See the activity feed for the runtime error.";
  } else if (browser && browser.status === "open") {
    emptyTitle = "Browser session is open.";
    emptyCopy = "Waiting for its first screenshot. No browser controls are available here.";
  } else if (terminal) {
    emptyTitle = "The run has ended.";
    emptyCopy = "The latest browser capture remains available when the runtime supplied one.";
  } else if (!isCurrentPhase) {
    emptyTitle = "No browser capture in this phase.";
    emptyCopy = "This is a snapshot of the selected phase, not the live browser.";
  } else if (!browser) {
    emptyTitle = "Waiting for Execution to open a browser.";
    emptyCopy = "This pane will show the first capture reported by the runtime.";
  } else if (phase !== "S2") {
    emptyTitle = "Browser work starts in Reproduce.";
    emptyCopy = "Execution is waiting for the reproduction phase.";
  }

  return (
    <section className="live-browser-pane" aria-label="Browser capture">
      <header className="live-browser-header">
        <div className="live-browser-heading">
          <span className="live-browser-heading-icon"><PatchIcon name="browser" size={17} /></span>
          <span><strong>Browser session</strong><small>{providerLabel}{browser && browser.env ? " · " + browser.env : ""}</small></span>
        </div>
        <div className="live-browser-badges">
          {browser && browser.status === "open" ? <span className="live-browser-state"><i />Session open</span> : null}
          <span className="live-provider-badge">{providerLabel}</span>
          <span className="live-step-badge">{step === null ? "0 steps" : "Step " + step}</span>
        </div>
      </header>
      <div className="live-browser-address">
        <span className="live-address-lock"><PatchIcon name="lock" size={12} /></span>
        <span className="live-address-value" title={targetUrl || "Waiting for target URL"}>{targetUrl || "Waiting for target URL"}</span>
        {browser && browser.title ? <span className="live-browser-page-title">{browser.title}</span> : null}
      </div>
      <div className={"live-browser-stage" + (!liveUrl && !screenshotUrl ? " is-empty" : "")}>
        {liveUrl ? (
          <>
            <iframe
              src={liveUrl}
              title={"Browserbase session, view only" + (targetUrl ? ": " + targetUrl : "")}
              sandbox="allow-scripts allow-same-origin"
              tabIndex={-1}
              aria-label="Browserbase live view, view only. Input and browser controls are disabled."
            />
            <span className="live-view-only"><PatchIcon name="verified" size={13} />View only</span>
          </>
        ) : screenshotUrl ? (
          <figure className="live-capture-figure">
            <img src={screenshotUrl} alt={"Latest browser capture" + (step === null ? "" : ", step " + step)} />
            <figcaption>Latest capture{captureTimeLabel ? " · " + captureTimeLabel : ""}{step === null ? "" : " · Step " + step}</figcaption>
          </figure>
        ) : (
          <div className="live-browser-empty">
            <span className="live-empty-mark"><PatchIcon name={browser && browser.status === "failed" ? "alert" : "browser"} size={20} /></span>
            <strong>{emptyTitle}</strong>
            <p>{emptyCopy}</p>
            {browser && browser.action ? <span className="live-browser-action">{browser.action}</span> : null}
          </div>
        )}
      </div>
      <footer className="live-browser-footer">
        <span>{browser && browser.action ? browser.action : isCurrentPhase ? "Latest capture from the active phase" : "Phase snapshot"}</span>
        <span>{screenshotUrl ? "Latest capture" : liveUrl ? "Session view" : "No capture yet"}{captureTimeLabel && screenshotUrl ? " · " + captureTimeLabel : ""}</span>
      </footer>
    </section>
  );
}

function AgentActivity({ agentId, activity }) {
  const agent = AGENTS[agentId] || { label: agentId, short: "AI", role: "Investigation role", model: "Runtime unavailable", color: "#64705E" };
  const status = activity.status || "idle";
  const summary = activity.summary;
  return (
    <article className={"live-agent-card is-" + statusTone(status)} style={{ "--agent-color": agent.color }}>
      <div className="live-agent-topline">
        <span className="live-agent-avatar">{agent.short}</span>
        <span className="live-agent-name"><strong>{agent.label}</strong><small>{agent.role}</small></span>
        <span className={"live-agent-status is-" + statusTone(status)}><i />{STATUS_LABELS[status] || "Waiting"}</span>
      </div>
      <div className="live-agent-task">
        <span className="live-agent-task-label">{summary ? "Current action" : status === "done" ? "Phase update" : "Next action"}</span>
        <p>{summary || (status === "done" ? "This agent reported completion for the selected phase." : "Waiting for activity in this phase.")}</p>
      </div>
      {activity.observation ? (
        <details className="live-agent-observation">
          <summary><PatchIcon name="activity" size={13} />Observation data</summary>
          <p>{activity.observation}</p>
        </details>
      ) : null}
      <footer className="live-agent-footer">
        <span>{activity.model || agent.model}</span>
        {activity.step === undefined || activity.step === null ? null : <span>Step {activity.step}</span>}
        {captureTime(activity.ts) ? <time>{captureTime(activity.ts)}</time> : null}
      </footer>
    </article>
  );
}

function AgentInspector({ phaseEvents, agents, phase, currentPhase }) {
  const [selected, setSelected] = useState(INSPECTOR_TABS[0].id);
  const activeTab = INSPECTOR_TABS.find((tab) => tab.id === selected) || INSPECTOR_TABS[0];
  return (
    <section className="live-agent-inspector" aria-label="Agent activity">
      <header className="live-inspector-heading">
        <div><span className="live-inspector-overline">Agent inspector</span><h2>Who's on the work</h2></div>
        <span className="live-inspector-phase">{phase === currentPhase ? "Current phase" : "Snapshot"}</span>
      </header>
      <div className="live-agent-tabs" role="tablist" aria-label="Agents">
        {INSPECTOR_TABS.map((tab) => {
          const selectedTab = tab.id === selected;
          const count = tab.agents.reduce((total, id) => total + phaseEvents.filter((event) => event.from === id && (event.kind === "activity" || event.kind === "tool" || event.kind === "browser" || event.kind === "ledger" || event.kind === "message")).length, 0);
          return (
            <button key={tab.id} type="button" role="tab" aria-selected={selectedTab} className={selectedTab ? "is-selected" : ""} onClick={() => setSelected(tab.id)}>
              {tab.label}
              <span className="live-agent-tab-indicator">{count > 0 ? <i /> : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="live-agent-cards" role="tabpanel" aria-label={activeTab.label}>
        {activeTab.agents.map((agentId) => (
          <AgentActivity key={agentId} agentId={agentId} activity={activityForAgent(agentId, phaseEvents, agents && agents[agentId], phase)} />
        ))}
      </div>
      <footer className="live-inspector-footer"><PatchIcon name="shield" size={14} /><span>Action summaries and observations only. Private reasoning is not shown.</span></footer>
    </section>
  );
}

function ReviewArtifacts({ runId, events }) {
  const review = liveReviewDetails(events);
  if (!review.patches.length && !review.verdicts.length) return null;
  const status = review.verdictResult === "verified"
    ? "Independent verification recorded"
    : review.verdictResult
      ? "Verification · " + sentence(review.verdictResult)
      : "Patch recorded · verification pending";
  const scope = review.scope === "localmemory"
    ? "Local memory sandbox only"
    : review.scope || "Not recorded";
  const artifactLabels = {
    "patch.diff": "Patch diff",
    "verification.md": "Verification report",
    "verification.json": "Verification data",
  };

  return (
    <section className="live-review-artifacts" aria-label="Implementation review artifacts">
      <div className="live-review-heading">
        <span className="live-review-mark"><PatchIcon name="verified" size={15} /></span>
        <span><strong>Implementation review</strong><small>{status}</small></span>
      </div>
      <div className="live-review-meta">
        <span><small>Branch</small><code>{review.branch || "Not recorded"}</code></span>
        <span><small>Validation scope</small><strong>{scope}</strong></span>
        {review.scope === "localmemory" ? <span className="live-review-scope-note">No repository push or merge is implied.</span> : null}
      </div>
      {review.artifacts.length ? (
        <nav className="live-review-links" aria-label="Review artifacts">
          {review.artifacts.map((artifact) => (
            <a key={artifact} href={`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact)}`} target="_blank" rel="noreferrer">
              <PatchIcon name="arrowUpRight" size={13} />{artifactLabels[artifact]}
            </a>
          ))}
        </nav>
      ) : <p className="live-review-empty">The ledger contains a patch or verdict record, but no review artifacts were attached.</p>}
      <div className="live-review-records">
        {review.patches.map((patch) => <span key={patch.id}>Patch <code>{patch.id}</code></span>)}
        {review.verdicts.map((verdict) => <span key={verdict.id}>Verdict <code>{verdict.id}</code></span>)}
      </div>
    </section>
  );
}

export default function LiveInvestigation({
  run,
  events = [],
  phaseEvents = [],
  agents = {},
  browsers = [],
  connection = "connecting",
  phase = "S0",
  currentPhase = "S0",
  followLive = true,
  direction = "forward",
  canStop = false,
  stopBusy = false,
  stopError = "",
  onSelectPhase,
  onFollowLive,
  onStop,
}) {
  const terminalEvent = [...events].reverse().find((event) => event.kind === "system" && ["RUN_FINISHED", "RUN_BLOCKED", "RUN_CANCELLED"].includes(event.type));
  const terminal = ["finished", "blocked", "cancelled", "canceled"].includes(run && run.status) || !!terminalEvent;
  const blocked = (run && run.status === "blocked") || (terminalEvent && terminalEvent.type === "RUN_BLOCKED");
  const cancelled = ["cancelled", "canceled"].includes(run && run.status) || (terminalEvent && terminalEvent.type === "RUN_CANCELLED");
  const outcome = terminalEvent && terminalEvent.type === "RUN_FINISHED"
    ? (terminalEvent.data && (terminalEvent.data.outcome || terminalEvent.data.result)) || terminalEvent.body || ""
    : "";
  const phaseSnapshot = phase !== currentPhase;
  const phaseBrowserEvents = phaseSnapshot ? phaseEvents : events;
  const phaseBrowsers = phaseSnapshot ? [] : browsers;
  const stopDisabled = !canStop || stopBusy || terminal || !!run.simulated;
  const connectionLabel = terminal
    ? blocked ? "Blocked" : cancelled ? "Stopped" : "Run complete"
    : connection === "live" ? "Live stream" : connection === "reconnecting" ? "Reconnecting" : "Connecting";
  const connectionTone = terminal ? "ended" : connection;
  const currentLabel = PHASES.find((item) => item.id === currentPhase)?.label || "Current phase";
  const selectedLabel = PHASES.find((item) => item.id === phase)?.label || "Phase";

  return (
    <section className="live-investigation" aria-label="Live investigation cockpit">
      <header className="live-cockpit-header">
        <div className="live-cockpit-title">
          <span className="live-cockpit-icon"><PatchIcon name="activity" size={17} /></span>
          <span><small>LIVE INVESTIGATION</small><h2>{run.title || "Untitled investigation"}</h2></span>
          {run.simulated ? <span className="live-simulated-label">Simulated replay · no agents running</span> : null}
        </div>
        <div className="live-cockpit-actions">
          <span className={"live-stream-status is-" + connectionTone}><i />{connectionLabel}</span>
          <button type="button" className="live-stop-button" onClick={onStop} disabled={stopDisabled} title={!canStop && !terminal ? "Approver access is required to stop a run." : undefined}>
            <span className="live-stop-glyph" aria-hidden="true">■</span>{stopBusy ? "Stopping…" : "Stop run"}
          </button>
        </div>
      </header>
      {stopError ? <p className="live-stop-error" role="alert"><PatchIcon name="alert" size={14} />{stopError}</p> : null}
      <PhaseTimeline
        phase={phase}
        currentPhase={currentPhase}
        followLive={followLive}
        events={phaseEvents}
        onSelectPhase={onSelectPhase}
        onFollowLive={onFollowLive}
        direction={direction}
      />
      <div key={phase + ":" + direction} className={"live-cockpit-grid slide-" + direction}>
        <BrowserPane
          run={run}
          phase={phase}
          currentPhase={currentPhase}
          phaseEvents={phaseBrowserEvents}
          events={events}
          browsers={phaseBrowsers}
          terminal={terminal}
        />
        <AgentInspector phaseEvents={phaseEvents} agents={agents} phase={phase} currentPhase={currentPhase} />
      </div>
      <ReviewArtifacts runId={run.id} events={events} />
      {terminal ? (
        <div className={"live-run-result" + (blocked ? " is-blocked" : cancelled ? " is-cancelled" : "")}>
          <span className="live-result-mark"><PatchIcon name={blocked ? "alert" : "verified"} size={16} /></span>
          <span className="live-result-copy"><strong>{blocked ? "Run blocked" : cancelled ? "Run stopped" : "Reproduction run complete"}</strong><small>{outcome ? sentence(outcome) : "The runtime has ended this investigation phase."}</small></span>
          {!blocked && !cancelled ? <a href={"/api/runs/" + encodeURIComponent(run.id) + "/artifacts/reproduction-packet.md"}>Download reproduction packet <PatchIcon name="arrowUpRight" size={14} /></a> : null}
        </div>
      ) : null}
      <p className="live-cockpit-note"><span>{phaseSnapshot ? selectedLabel + " snapshot" : followLive ? "Following live" : "Live following paused"}</span><span>{phaseSnapshot ? "The browser is a saved phase capture." : "The browser pane is view only; changes stream from the runtime."}</span></p>
    </section>
  );
}
