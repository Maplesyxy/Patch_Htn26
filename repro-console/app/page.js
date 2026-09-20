"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomerIntake from "@/components/CustomerIntake";
import PatchIcon from "@/components/PatchIcon";
import PatchShell from "@/components/PatchShell";
import { STAGES } from "@/lib/agents";

const VIEWS = ["overview", "investigations", "agents", "settings"];
const FILTERS = [
  ["all", "All"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
];

function stageName(id) {
  const stage = STAGES.find((item) => item.id === id);
  return stage ? stage.name : id || "Intake";
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function viewFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return VIEWS.includes(view) ? view : "overview";
}

function ViewHeading({ eyebrow, title, children, action }) {
  return (
    <div className="patch-page-heading">
      <div>
        {eyebrow ? <p className="patch-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children ? <p className="patch-heading-copy">{children}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

function StepIcon({ name }) {
  return (
    <span className={"patch-step-icon patch-step-icon-" + name} aria-hidden="true">
      <PatchIcon name={name} size={19} />
    </span>
  );
}

function Workflow() {
  return (
    <section className="patch-workflow" aria-label="How Patch works">
      <div className="patch-workflow-step patch-intake-step">
        <div className="patch-step-top">
          <StepIcon name="inbox" />
          <span className="patch-step-number">01</span>
        </div>
        <div>
          <h2>Customer intake</h2>
          <p>Reports become clear, testable signals.</p>
        </div>
        <div className="patch-step-foot">
          <span className="patch-model-mark" aria-hidden="true">G</span>
          <span>Gemini Flash</span>
        </div>
      </div>

      <span className="patch-flow-link" aria-hidden="true"><span /></span>

      <div className="patch-workflow-step patch-swarm-step">
        <div className="patch-step-top">
          <StepIcon name="swarm" />
          <span className="patch-step-number">02</span>
        </div>
        <div className="patch-swarm-heading">
          <div>
            <h2>Reproduction swarm</h2>
            <p>Independent work, shared evidence.</p>
          </div>
          <span className="patch-live-dot"><i /> Evidence-led</span>
        </div>
        <div className="patch-swarm-cards">
          <div className="patch-mini-agent">
            <span className="patch-mini-symbol"><PatchIcon name="play" size={14} /></span>
            <span><strong>Execution</strong><small>QA engineer</small></span>
          </div>
          <div className="patch-mini-agent">
            <span className="patch-mini-symbol"><PatchIcon name="compass" size={14} /></span>
            <span><strong>Supervisor</strong><small>Incident lead</small></span>
          </div>
          <div className="patch-mini-agent">
            <span className="patch-mini-symbol"><PatchIcon name="layers" size={14} /></span>
            <span><strong>Incidents</strong><small>SRE analyst</small></span>
          </div>
        </div>
        <span className="patch-handoff"><span className="patch-handoff-line" />Incident brief</span>
      </div>

      <span className="patch-flow-link" aria-hidden="true"><span /></span>

      <div className="patch-workflow-step patch-implementation-step">
        <div className="patch-step-top">
          <StepIcon name="code" />
          <span className="patch-step-number">03</span>
        </div>
        <div>
          <h2>Implementation</h2>
          <p>A proposed fix is checked against the reproduced failure.</p>
        </div>
        <div className="patch-step-foot">
          <span className="patch-plan-dot" />
          <span>Claude Code Opus · included app</span>
        </div>
        <span className="patch-handoff patch-handoff-implementation"><span className="patch-handoff-line" />Patch &amp; verification</span>
      </div>

      <div className="patch-workflow-caption">
        <span>Every fix starts with a failure we can reproduce.</span>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("patch:navigate", { detail: "agents" }))}>
          Explore the ensemble <PatchIcon name="arrowRight" size={14} />
        </button>
      </div>
    </section>
  );
}

function SampleReplay({ starting, onStart }) {
  return (
    <section className="patch-sample-card">
      <div className="patch-sample-copy">
        <div className="patch-sample-label"><span className="patch-sample-glyph"><PatchIcon name="spark" size={13} /></span> Sample replay</div>
        <h2>One click.<br />Two bookings.</h2>
        <p>Follow the team as it traces a duplicate booking to a lost network response.</p>
        <button className="patch-button patch-button-dark" type="button" onClick={onStart} disabled={starting}>
          {starting ? "Starting investigation…" : "Watch investigation"}
          {!starting ? <PatchIcon name="arrowRight" size={15} /> : <span className="patch-button-spinner" aria-hidden="true" />}
        </button>
        <span className="patch-sample-disclosure">A simulated investigation, clearly labeled in the room.</span>
      </div>
      <div className="patch-trace" aria-label="Example network trace">
        <div className="patch-trace-top">
          <span className="patch-trace-dots"><i /><i /><i /></span>
          <span>booking flow / network trace</span>
          <span className="patch-trace-code">TRACE 08:42</span>
        </div>
        <div className="patch-trace-body">
          <div className="patch-trace-line"><span className="patch-trace-time">08:42:14</span><span className="patch-trace-node patch-node-user" /><span><strong>Customer</strong><small>Submit booking · 1 click</small></span><span className="patch-trace-tag">INPUT</span></div>
          <div className="patch-trace-line"><span className="patch-trace-time">08:42:14</span><span className="patch-trace-node patch-node-request" /><span><strong>POST /bookings</strong><small>Request accepted · 201</small></span><span className="patch-trace-tag">200 ms</span></div>
          <div className="patch-trace-line patch-trace-warning"><span className="patch-trace-time">08:42:17</span><span className="patch-trace-node patch-node-lost" /><span><strong>Response lost</strong><small>Connection closed before receipt</small></span><span className="patch-trace-tag">NETWORK</span></div>
          <div className="patch-trace-line patch-trace-repeat"><span className="patch-trace-time">08:42:18</span><span className="patch-trace-node patch-node-request" /><span><strong>POST /bookings</strong><small>Retry creates booking #2</small></span><span className="patch-trace-tag">RETRY</span></div>
        </div>
        <div className="patch-trace-foot"><span className="patch-trace-foot-mark">!</span><span>Same intent. Two reservations.</span><span className="patch-trace-foot-ref">EXP-03</span></div>
      </div>
    </section>
  );
}

const EVIDENCE_ITEMS = [
  ["browser", "Browser recordings", "See the exact conditions around a failure."],
  ["activity", "Incident trail", "Keep claims, experiments, and decisions together."],
  ["verified", "Verified handoff", "Check the fix against the original regression."],
];

function EvidenceCard() {
  return (
    <section className="patch-evidence-card">
      <div className="patch-card-heading">
        <span className="patch-section-kicker">Built around evidence</span>
        <span className="patch-card-heading-mark"><PatchIcon name="shield" size={17} /></span>
      </div>
      <div className="patch-evidence-list">
        {EVIDENCE_ITEMS.map(([icon, title, copy]) => (
          <div className="patch-evidence-row" key={title}>
            <span className="patch-evidence-icon"><PatchIcon name={icon} size={16} /></span>
            <span><strong>{title}</strong><small>{copy}</small></span>
          </div>
        ))}
      </div>
      <div className="patch-evidence-note"><span className="patch-evidence-note-line" />Every claim has a source. Every verdict has a test.</div>
    </section>
  );
}

function RunTable({ runs, loading, filter, onFilter, search, onSearch, expanded = false }) {
  const searchInput = useRef(null);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (runs || []).filter((run) => {
      const complete = run.status === "finished";
      if (filter === "completed" && !complete) return false;
      if (filter === "in_progress" && complete) return false;
      return !term || [run.title, run.workspace, run.stage, run.id].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [runs, filter, search]);

  useEffect(() => {
    function focusSearch(event) {
      const target = event.target;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchInput.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <section className={"patch-investigations-card" + (expanded ? " patch-investigations-expanded" : "")}>
      <div className="patch-investigations-head">
        <div>
          <div className="patch-investigations-title-line">
            <h2>Investigations</h2>
            <span className="patch-total-count">{runs ? runs.length : "—"}</span>
          </div>
          <p>Live work from your agent runtime and sample replays.</p>
        </div>
        <label className="patch-search">
          <PatchIcon name="search" size={16} />
          <input ref={searchInput} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search investigations" aria-label="Search investigations" />
          <kbd>/</kbd>
        </label>
      </div>
      <div className="patch-table-toolbar">
        <div className="patch-filter-tabs" role="tablist" aria-label="Filter investigations">
          {FILTERS.map(([key, label]) => (
            <button className={filter === key ? "is-active" : ""} role="tab" aria-selected={filter === key} key={key} type="button" onClick={() => onFilter(key)}>
              {label}{key === "all" ? <span>{runs ? runs.length : "—"}</span> : null}
            </button>
          ))}
        </div>
        <span className="patch-refreshing"><i /> Updates every 5 sec</span>
      </div>
      <div className="patch-run-table-wrap">
        <table className="patch-run-table">
          <thead><tr><th scope="col">Investigation</th><th scope="col">Stage</th><th scope="col">Status</th><th scope="col">Activity</th><th scope="col">Created</th><th scope="col"><span className="patch-sr-only">Open</span></th></tr></thead>
          <tbody>
            {visible.map((run) => {
              const complete = run.status === "finished";
              return (
                <tr key={run.id}>
                  <td>
                    <a className="patch-run-title" href={"/runs/" + encodeURIComponent(run.id)}>{run.title || "Untitled investigation"}</a>
                    <span className="patch-run-subtitle">{run.simulated ? <span className="patch-simulated-tag"><i />Simulated</span> : null}<span>{run.workspace || "Workspace"} · {run.id}</span></span>
                  </td>
                  <td><span className="patch-stage-value"><span>{run.stage || "S0"}</span>{stageName(run.stage)}</span></td>
                  <td><span className={"patch-status " + (complete ? "patch-status-complete" : "patch-status-progress")}><i />{complete ? "Completed" : "In progress"}</span></td>
                  <td className="patch-event-count">{run.eventCount || 0} events</td>
                  <td className="patch-date">{formatDate(run.createdAt)}</td>
                  <td><a className="patch-open-run" href={"/runs/" + encodeURIComponent(run.id)} aria-label={"Open " + (run.title || "investigation")}><PatchIcon name="arrowRight" size={15} /></a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && !runs ? (
          <div className="patch-table-empty patch-table-loading"><span className="patch-loading-mark" /><span>Loading investigations…</span></div>
        ) : !runs ? (
          <div className="patch-table-empty">
            <span className="patch-empty-icon"><PatchIcon name="alert" size={18} /></span>
            <strong>Investigations could not be loaded.</strong>
            <span>The workspace will retry shortly.</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="patch-table-empty">
            <span className="patch-empty-icon"><PatchIcon name={runs && runs.length ? "search" : "inbox"} size={18} /></span>
            <strong>{runs && runs.length ? "No matching investigations." : "Your first investigation starts here."}</strong>
            <span>{runs && runs.length ? "Try a different search or status filter." : "Report a bug or explore the sample above."}</span>
          </div>
        ) : null}
      </div>
      <div className="patch-table-footer">
        <span>Showing <strong>{visible.length}</strong> of <strong>{runs ? runs.length : "—"}</strong> investigations</span>
        <span><i className="patch-footer-dot" /> Synced with Patch runtime</span>
      </div>
    </section>
  );
}

function Overview({ runs, loading, onStart, starting, filter, onFilter, search, onSearch, error }) {
  return (
    <>
      <ViewHeading eyebrow="Your investigation workspace" title="Good fixes start with proof." action={<button className="patch-button patch-button-primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("patch:new-report"))}><PatchIcon name="plus" size={16} />New report</button>}>
        Turn customer reports into reproducible bugs, then fixes you can trust.
      </ViewHeading>
      {error ? <div className="patch-inline-error" role="alert"><PatchIcon name="alert" size={16} />{error}</div> : null}
      <Workflow />
      <div className="patch-feature-grid">
        <SampleReplay starting={starting} onStart={onStart} />
        <EvidenceCard />
      </div>
      <RunTable runs={runs} loading={loading} filter={filter} onFilter={onFilter} search={search} onSearch={onSearch} />
    </>
  );
}

function AgentsView() {
  const roles = [
    ["play", "Execution", "QA engineer", "Runs controlled browser experiments and records reproduction evidence."],
    ["compass", "Supervisor", "Incident lead", "Schedules experiments, owns hypotheses, and controls stage gates."],
    ["layers", "Incidents", "SRE analyst", "Reconstructs system behavior from logs and incident signals."],
  ];
  return (
    <>
      <ViewHeading eyebrow="The ensemble" title="Independent work. Shared evidence." action={<span className="patch-architecture-tag"><span />Role boundaries enforced</span>}>
        Each role has a clear job, and the evidence ledger keeps every handoff grounded.
      </ViewHeading>
      <section className="patch-architecture-card">
        <div className="patch-architecture-topline"><span>INVESTIGATION FLOW</span><span>01 — 04</span></div>
        <div className="patch-architecture-flow">
          <div className="patch-architecture-entry">
            <span className="patch-architecture-icon"><PatchIcon name="inbox" size={18} /></span>
            <span><small>CUSTOMER AGENT</small><strong>Customer intake</strong><small>Gemini Flash</small></span>
          </div>
          <span className="patch-architecture-connector"><i /></span>
          <div className="patch-architecture-team">
            <div className="patch-architecture-team-head"><span>REPRODUCTION SWARM</span><span>3 roles</span></div>
            <div className="patch-architecture-role-grid">
              {roles.map(([icon, title, role, desc], i) => (
                <article className="patch-architecture-role" key={role}>
                  <span className="patch-role-index">0{i + 1}</span>
                  <span className="patch-role-icon"><PatchIcon name={icon} size={16} /></span>
                  <strong>{title}</strong><small>{role}</small><p>{desc}</p>
                </article>
              ))}
            </div>
          </div>
          <span className="patch-architecture-connector"><i /></span>
          <div className="patch-architecture-exit">
            <span className="patch-architecture-icon patch-implementation-icon"><PatchIcon name="code" size={18} /></span>
            <span><small>FIX · INCLUDED APP ONLY</small><strong>Implementation</strong><em>Claude Code Opus · optional</em></span>
          </div>
        </div>
        <div className="patch-architecture-bottom">
          <span className="patch-architecture-rule"><PatchIcon name="shield" size={16} /><strong>Independent verifier</strong><span>For the included app, protected checks run against the isolated local-memory patch before a verdict is recorded.</span></span>
          <span className="patch-architecture-ledger"><PatchIcon name="layers" size={15} /> One append-only evidence trail</span>
        </div>
      </section>
      <section className="patch-principles-grid">
        <article><span>01</span><h2>Evidence over assertion</h2><p>A claim needs a source. A challenge needs a test that can settle it.</p></article>
        <article><span>02</span><h2>Clear responsibility</h2><p>Agents receive only the write permissions needed for their role.</p></article>
        <article><span>03</span><h2>A human at release</h2><p>Approval stays with a person before a change reaches production.</p></article>
      </section>
    </>
  );
}

function SettingsView({ me }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";
  const snippet = [
    "cd repro-console",
    "export REPRO_CONSOLE_URL=" + origin,
    "export PATCH_RUNTIME_TOKEN=<shared console and worker secret>",
    "export REPRO_INGEST_TOKEN=<token matching REPRO_INGEST_TOKENS>",
    "# Included booking app source fixes only",
    "export PATCH_FIX_BOOKING_APP=1",
    "export PATCH_FIX_REPO_PATH=<absolute Patch repository root>",
    "npm run dev:live",
  ].join("\n");
  return (
    <>
      <ViewHeading eyebrow="Workspace settings" title="Connect your runtime.">
        The live worker uses Claude Code and Gemini beside the console. Its optional source-fix adapter is limited to the included booking app.
      </ViewHeading>
      <div className="patch-settings-grid">
        <section className="patch-settings-card patch-runtime-card">
          <div className="patch-settings-card-heading">
            <span className="patch-settings-icon"><PatchIcon name="terminal" size={18} /></span>
            <span><h2>Runtime connection</h2><p>Run from repro-console/ on the worker machine.</p></span>
            <span className="patch-config-state"><i /> Optional setup</span>
          </div>
          <pre className="patch-code-block"><code>{snippet}</code><span className="patch-code-language">SHELL</span></pre>
          <p className="patch-settings-footnote"><PatchIcon name="lock" size={14} />Keep the ingest token in the runtime environment. It is never shown to the browser.</p>
          <p className="patch-settings-note">A website URL alone does not enable source edits for arbitrary repositories.</p>
        </section>
        <section className="patch-settings-card">
          <div className="patch-settings-card-heading">
            <span className="patch-settings-icon patch-settings-icon-lime"><PatchIcon name="sliders" size={18} /></span>
            <span><h2>Workspace status</h2><p>Connection details reported by this server.</p></span>
          </div>
          <dl className="patch-settings-facts">
            <div><dt>Workspace</dt><dd><span className="patch-workspace-dot" />Hack the North</dd></div>
            <div><dt>Signed in as</dt><dd>{me ? me.name : "Loading"}{me ? <span className="patch-role-chip">{me.role}</span> : null}</dd></div>
            <div><dt>Sign-in</dt><dd><span className={"patch-fact-indicator " + (me && me.signInOn ? "is-on" : "is-off")} />{me ? me.signInOn ? "Enabled" : "Open access" : "Loading"}</dd></div>
            <div><dt>Event store</dt><dd><span className={"patch-fact-indicator " + (me && me.store === "redis" ? "is-on" : "is-off")} />{me ? me.store === "redis" ? "Upstash Redis" : "In-memory" : "Loading"}</dd></div>
            <div><dt>Deployment</dt><dd>{me ? me.onVercel ? "Vercel" : "Local / custom" : "Loading"}</dd></div>
          </dl>
          {me && !me.signInOn ? <p className="patch-settings-warning"><PatchIcon name="alert" size={15} />Sign-in is off. Set REPRO_APPROVER_PASSWORD and REPRO_SESSION_SECRET before sharing this URL.</p> : null}
          {me && me.store === "memory" && me.onVercel ? <p className="patch-settings-warning"><PatchIcon name="alert" size={15} />Memory storage is temporary on Vercel. Add Upstash Redis from the marketplace and redeploy.</p> : null}
          {me && me.store === "memory" && !me.onVercel ? <p className="patch-settings-note">Local memory storage is useful for development. Runs reset when the dev server restarts.</p> : null}
        </section>
      </div>
      <section className="patch-settings-help">
        <span className="patch-settings-help-icon"><PatchIcon name="book" size={17} /></span>
        <span><strong>Setting up the Repro runtime?</strong><small>Read the deployment guide for ingest tokens, worker setup, and the simulated replay.</small></span>
        <a href="https://github.com/Maplesyxy/Patch_Htn26/blob/main/repro-console/README.md#deploy" target="_blank" rel="noreferrer">Open setup guide <PatchIcon name="arrowUpRight" size={14} /></a>
      </section>
    </>
  );
}

export default function Home() {
  const [me, setMe] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState("overview");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");

  const navigate = useCallback((next) => {
    const safeView = VIEWS.includes(next) ? next : "overview";
    const url = new URL(window.location.href);
    if (safeView === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", safeView);
    url.searchParams.delete("intake");
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    setView(safeView);
    setIntakeOpen(false);
  }, []);

  const openIntake = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("intake", "1");
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    setIntakeOpen(true);
  }, []);

  const closeIntake = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("intake");
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    setIntakeOpen(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const [meResponse, runsResponse] = await Promise.all([fetch("/api/me", { cache: "no-store" }), fetch("/api/runs", { cache: "no-store" })]);
      if (meResponse.status === 401 || runsResponse.status === 401) {
        window.location.href = "/login";
        return;
      }
      const meData = await meResponse.json();
      const runsData = await runsResponse.json();
      if (!meResponse.ok) throw new Error(meData.error || "Could not load workspace details.");
      if (!runsResponse.ok) throw new Error(runsData.error || "Could not load investigations.");
      setMe(meData);
      setRuns(Array.isArray(runsData.runs) ? runsData.runs : []);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Could not reach the server. Reload to try again.");
    }
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      setView(viewFromLocation());
      setIntakeOpen(new URLSearchParams(window.location.search).get("intake") === "1");
    };
    syncFromLocation();
    const onNavigate = (event) => navigate(event.detail);
    const onNewReport = () => openIntake();
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("patch:navigate", onNavigate);
    window.addEventListener("patch:new-report", onNewReport);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("patch:navigate", onNavigate);
      window.removeEventListener("patch:new-report", onNewReport);
    };
  }, [navigate, openIntake]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function startReplay() {
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulated: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the replay.");
      if (!data.run || !data.run.id) throw new Error("The server did not return an investigation.");
      window.location.href = "/runs/" + encodeURIComponent(data.run.id);
    } catch (err) {
      setError(err.message || "Could not start the replay. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/login", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not sign out.");
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Could not sign out.");
    }
  }

  const titles = { overview: "Overview", investigations: "Investigations", agents: "Agent ensemble", settings: "Runtime settings" };
  const active = view;

  return (
    <>
      <PatchShell active={active} title={titles[view]} onNavigate={navigate} onNewReport={openIntake} me={me} onSignOut={signOut}>
        <div className="patch-main-content">
          {view === "overview" ? <Overview runs={runs} loading={!runs && !loadError} onStart={startReplay} starting={starting} filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} error={error || loadError} /> : null}
          {view === "investigations" ? (
            <>
              <ViewHeading eyebrow="Your workspace" title="Investigations" action={<button className="patch-button patch-button-primary" type="button" onClick={openIntake}><PatchIcon name="plus" size={16} />New report</button>}>Follow live work, replay a sample, or open an investigation to inspect its evidence.</ViewHeading>
              {error || loadError ? <div className="patch-inline-error" role="alert"><PatchIcon name="alert" size={16} />{error || loadError}</div> : null}
              <RunTable runs={runs} loading={!runs && !loadError} filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} expanded />
            </>
          ) : null}
          {view === "agents" ? <AgentsView /> : null}
          {view === "settings" ? <SettingsView me={me} /> : null}
        </div>
      </PatchShell>
      <CustomerIntake open={intakeOpen} onClose={closeIntake} />
    </>
  );
}
