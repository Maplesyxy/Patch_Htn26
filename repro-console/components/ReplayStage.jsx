"use client";

import "./replay-stage.css";

const TITLES = {
  S0: "Customer intake",
  S1: "Incident correlation",
  S2: "Reproduction experiment",
  S3: "Implementation work",
  S4: "Verification review",
  S5: "Release decisions",
};

function recordList(records, limit = 3) {
  return Object.values(records || {}).sort((a, b) => (a._firstSeq || 0) - (b._firstSeq || 0)).slice(0, limit);
}

function EmptyScene({ children = "Waiting for recorded activity in this phase." }) {
  return <div className="replay-empty">{children}</div>;
}

function IntakeScene({ claims }) {
  if (!claims.length) return <EmptyScene />;
  return <div className="replay-intake-list">
    {claims.map((claim) => <article className="replay-intake-item" key={claim.id}>
      <span className="replay-item-id">{claim.id}</span>
      <p>{claim.statement || claim.title || "Customer-reported evidence"}</p>
      <span className="replay-item-meta">{claim.source ? `${claim.source.kind || "source"}${claim.source.ref ? ` · ${claim.source.ref}` : ""}` : "Recorded claim"}</span>
    </article>)}
  </div>;
}

function CorrelationScene({ incidents, hypotheses }) {
  if (!incidents.length && !hypotheses.length) return <EmptyScene />;
  return <div className="replay-correlation">
    {incidents.slice(0, 2).map((incident) => <article className="replay-incident" key={incident.id}>
      <span className="replay-item-id">{incident.id} · {incident.status || "open"}</span>
      <strong>{incident.title || "Incident group"}</strong>
      {incident.tickets?.length ? <small>{incident.tickets.length} linked tickets</small> : null}
    </article>)}
    <div className="replay-hypotheses">
      {hypotheses.slice(0, 3).map((hypothesis) => <div className="replay-hypothesis" key={hypothesis.id}>
        <span className="replay-item-id">{hypothesis.id}</span>
        <span>{hypothesis.statement || hypothesis.predicts}</span>
        <small>{hypothesis.status || "proposed"}</small>
      </div>)}
    </div>
  </div>;
}

function BrowserScene({ experiments }) {
  const experiment = experiments.find((item) => item.id === "EXP-3") || experiments[0];
  const matrix = experiment?.matrix || [];
  const clean = matrix.find((row) => !/drop|lost/i.test(row.fault || "") && Number(row.runs) > 0);
  const lost = matrix.find((row) => /drop|lost/i.test(row.fault || "") && Number(row.failed) > 0);
  const confirmsDuplicate = experiment?.outcome === "supports" && lost;
  return <div className="replay-browser-stage">
    <div className="replay-browser-window" role="group" aria-label="Demo browser view">
      <div className="replay-browser-chrome">
        <span className="replay-window-dots"><i /><i /><i /></span>
        <span className="replay-address"><span aria-hidden="true">◉</span> booking app</span>
      </div>
      <div className="replay-booking-scene">
        <div className="replay-booking-copy">
          <span className="replay-scene-kicker">Reservation flow</span>
          <strong>Book once</strong>
        </div>
        <span className="replay-booking-button">Book a table <i aria-hidden="true">↗</i></span>
        {confirmsDuplicate ? <div className="replay-reservation-stack" aria-label="Recorded duplicate reservations after a lost response">
          <span>Reservation A</span>
          <span>Reservation B</span>
        </div> : <div className="replay-booking-note">Awaiting experiment result</div>}
      </div>
    </div>
    <div className="replay-experiment-summary">
      <span className="replay-source-tag">{experiment ? experiment.id : "Browser experiment"}</span>
      {experiment ? <>
        <span className={experiment.outcome === "supports" ? "replay-result supports" : "replay-result"}>{experiment.outcome || "in progress"}</span>
        <p>{experiment.observed || experiment.expected_if_true || "No observation recorded yet."}</p>
        {clean ? <small>Clean control: {clean.failed}/{clean.runs} failed</small> : null}
        {lost ? <small>Lost-response run: {lost.failed}/{lost.runs} failed · {lost.env}</small> : null}
      </> : <p>No experiment has been recorded in this phase yet.</p>}
    </div>
  </div>;
}

function ImplementationScene({ patches }) {
  if (!patches.length) return <EmptyScene>Waiting for implementation activity.</EmptyScene>;
  return <div className="replay-patch-list">
    {patches.map((patch) => <article className="replay-patch-card" key={patch.id}>
      <header><span className="replay-item-id">{patch.id}</span><code>{patch.branch || "Recorded patch"}</code></header>
      <p>{patch.root_cause || "A patch record was added."}</p>
      <footer>
        {patch.supersedes ? <span>Supersedes {patch.supersedes}</span> : <span>Source change recorded</span>}
        {patch.diff_path ? <code>{patch.diff_path}</code> : null}
      </footer>
    </article>)}
  </div>;
}

function VerificationScene({ verdicts }) {
  if (!verdicts.length) return <EmptyScene>Waiting for a verification verdict.</EmptyScene>;
  return <div className="replay-verdict-list">
    {verdicts.map((verdict) => <article className={`replay-verdict ${verdict.result || "pending"}`} key={verdict.id}>
      <header><span className="replay-item-id">{verdict.id}{verdict.patch ? ` · ${verdict.patch}` : ""}</span><strong>{verdict.result || "Pending"}</strong></header>
      <div className="replay-checks">
        {verdict.regression_fails_on_base !== undefined ? <span><i className={verdict.regression_fails_on_base ? "pass" : "fail"} />Base fails: {verdict.regression_fails_on_base ? "yes" : "no"}</span> : null}
        {verdict.regression_passes_on_branch !== undefined ? <span><i className={verdict.regression_passes_on_branch ? "pass" : "fail"} />Branch passes: {verdict.regression_passes_on_branch ? "yes" : "no"}</span> : null}
        {verdict.existing_suite ? <span><i className={verdict.existing_suite === "pass" ? "pass" : "fail"} />Existing suite: {verdict.existing_suite}</span> : null}
      </div>
      {verdict.adversarial_cases?.length ? <small>{verdict.adversarial_cases.length} recorded adversarial cases</small> : null}
    </article>)}
  </div>;
}

function ReleaseScene({ events }) {
  const approvals = events.filter((event) => event.kind === "approval").map((event) => event.data);
  if (!approvals.length) return <EmptyScene>Release actions will appear here when approval requests are recorded.</EmptyScene>;
  return <div className="replay-approval-list">
    {approvals.map((approval) => <article className="replay-approval-item" key={approval.id}>
      <span className="replay-item-id">{approval.id} · approval requested</span>
      <strong>{approval.title}</strong>
      <small>{approval.detail}</small>
    </article>)}
  </div>;
}

export default function ReplayStage({ phase, events, ledger }) {
  const claims = recordList(ledger?.claim);
  const incidents = recordList(ledger?.incident, 2);
  const hypotheses = recordList(ledger?.hypothesis, 3);
  const experiments = recordList(ledger?.experiment, 8);
  const patches = recordList(ledger?.patch, 3);
  const verdicts = recordList(ledger?.verdict, 3);
  let scene;
  if (phase === "S0") scene = <IntakeScene claims={claims} />;
  else if (phase === "S1") scene = <CorrelationScene incidents={incidents} hypotheses={hypotheses} />;
  else if (phase === "S2") scene = <BrowserScene experiments={experiments} />;
  else if (phase === "S3") scene = <ImplementationScene patches={patches} />;
  else if (phase === "S4") scene = <VerificationScene verdicts={verdicts} />;
  else scene = <ReleaseScene events={events} />;

  return <section className="replay-stage" aria-label={`${TITLES[phase] || "Investigation"} overview`}>
    <div className="replay-stage-heading">
      <div><span className="replay-stage-mark" aria-hidden="true">✳</span><strong>{TITLES[phase] || "Investigation"}</strong></div>
    </div>
    <div className="replay-stage-content">{scene}</div>
  </section>;
}
