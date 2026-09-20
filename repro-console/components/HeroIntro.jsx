"use client";

import { useState } from "react";
import PatchIcon from "@/components/PatchIcon";

export default function HeroIntro({ onReport, onDemo, starting = false }) {
  const [paused, setPaused] = useState(false);

  return (
    <section className="patch-hero" aria-labelledby="patch-hero-title">
      <div className="patch-hero-copy">
        <h1 id="patch-hero-title">Every bug has a story.<br /><span>Let’s find the fix.</span></h1>
        <p className="patch-hero-description">Turn a customer report into a failure you can reproduce — and a fix you can prove.</p>
        <div className="patch-hero-actions">
          <button className="patch-button patch-button-primary" type="button" onClick={onReport}><PatchIcon name="plus" size={17} />Report a bug</button>
          <button className="patch-button patch-button-secondary" type="button" onClick={onDemo} disabled={starting}>
            <span className={starting ? "patch-demo-loading" : "patch-demo-play"} aria-hidden="true">{starting ? null : <PatchIcon name="play" size={13} />}</span>
            {starting ? "Starting demo…" : "Watch a demo"}
          </button>
        </div>
      </div>

      <div className={"patch-hero-art" + (paused ? " is-paused" : "")}>
        <svg className="patch-hero-flow" viewBox="0 0 700 420" role="img" aria-labelledby="hero-flow-title hero-flow-desc">
          <title id="hero-flow-title">A report becomes a verified patch</title>
          <desc id="hero-flow-desc">A customer report flows through three independent investigation roles and into a tested patch.</desc>
          <defs>
            <linearGradient id="hero-flow-gradient" x1="70" y1="190" x2="650" y2="210" gradientUnits="userSpaceOnUse">
              <stop stopColor="#B8DADD" /><stop offset=".56" stopColor="#6CA7A8" /><stop offset="1" stopColor="#D6A27B" />
            </linearGradient>
            <radialGradient id="hero-wash" cx="0" cy="0" r="1" gradientTransform="matrix(338 0 0 216 354 207)" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E3F2F1" /><stop offset="1" stopColor="#E3F2F1" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="365" cy="210" rx="330" ry="190" fill="url(#hero-wash)" />
          <path className="patch-hero-orbit" d="M46 209C146 209 163 104 274 104s104 211 210 211 88-106 170-106" />
          <path className="patch-hero-flow-dash" d="M46 209C146 209 163 104 274 104s104 211 210 211 88-106 170-106" />
          <path className="patch-hero-branch" d="M274 104c35 0 48 46 74 78m-74 33c37 0 47 1 76 1m-76 32c35 0 48-45 74-77" />
          <circle className="patch-hero-flow-pulse" cx="48" cy="209" r="5" />
          <circle className="patch-hero-flow-target" cx="654" cy="209" r="7" />
          <circle cx="274" cy="104" r="3.5" fill="#246F78" /><circle cx="274" cy="215" r="3.5" fill="#246F78" /><circle cx="274" cy="247" r="3.5" fill="#246F78" />
        </svg>

        <div className="patch-hero-report-card patch-float-one">
          <span className="patch-hero-card-icon patch-hero-card-icon-report"><PatchIcon name="inbox" size={18} /></span>
          <span><small>Customer report</small><strong>One click. Two bookings.</strong><em>Browser recording attached</em></span>
        </div>
        <div className="patch-hero-agents" role="group" aria-label="Three investigation roles">
          <div className="patch-hero-agent-card patch-hero-agent-execution patch-float-two">
            <span className="patch-hero-agent-icon"><PatchIcon name="play" size={15} /></span><span><strong>Execution</strong><small>Browser QA</small></span><i />
          </div>
          <div className="patch-hero-agent-card patch-hero-agent-supervisor patch-float-three">
            <span className="patch-hero-agent-icon"><PatchIcon name="compass" size={15} /></span><span><strong>Supervisor</strong><small>Coordinate</small></span><i />
          </div>
          <div className="patch-hero-agent-card patch-hero-agent-incidents patch-float-one">
            <span className="patch-hero-agent-icon"><PatchIcon name="activity" size={15} /></span><span><strong>Incidents</strong><small>Trace logs</small></span><i />
          </div>
        </div>
        <div className="patch-hero-fix-card patch-float-two">
          <span className="patch-hero-fix-icon"><PatchIcon name="verified" size={18} /></span>
          <span><small>Implementation</small><strong>Patch &amp; verification</strong><em>Evidence-linked handoff</em></span>
        </div>
        <div className="patch-hero-art-caption"><span>REPORT</span><i /><span>REPRODUCE</span><i /><span>VERIFY</span></div>
        <button className="patch-motion-toggle" type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused} aria-label={paused ? "Resume illustration animation" : "Pause illustration animation"}>
          {paused ? <span className="patch-motion-play" aria-hidden="true" /> : <span className="patch-motion-pause" aria-hidden="true"><i /><i /></span>}
        </button>
      </div>
    </section>
  );
}
