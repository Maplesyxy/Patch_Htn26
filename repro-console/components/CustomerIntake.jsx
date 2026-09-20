"use client";

import { useEffect, useRef, useState } from "react";
import "./intake.css";

const STORAGE_KEY = "patch.customer.brief.v1";
const SAMPLE_REPORT = "I'm seeing duplicate bookings when I double-click Reserve. I expected one reservation but got two. It happened in Chrome on Windows over home Wi-Fi.";

function modelLabel(model) {
  if (!model) return "Gemini";
  return model.replace(/^gemini-/i, "Gemini ").replace(/-/g, " ").replace(/\bflash\b/i, "Flash").replace(/\bpro\b/i, "Pro");
}

function briefMarkdown(brief) {
  const field = (value) => value?.trim() || "Unknown";
  return [
    `# ${field(brief.title)}`,
    "",
    "## Summary",
    field(brief.summary),
    "",
    "## Expected",
    field(brief.expected),
    "",
    "## Actual",
    field(brief.actual),
    "",
    "## Environment",
    field(brief.environment),
    "",
    "## Reproduction steps",
    ...(brief.steps?.length ? brief.steps.map((step, i) => `${i + 1}. ${step}`) : ["Unknown"]),
    "",
    "## Unknowns",
    ...(brief.unknowns?.length ? brief.unknowns.map((item) => `- ${item}`) : ["- None marked"]),
    "",
  ].join("\n");
}

function PatchMark() {
  return (
    <span className="intake-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 20.2c-4.55 0-8.2-3.66-8.2-8.2S7.45 3.8 12 3.8s8.2 3.65 8.2 8.2-3.65 8.2-8.2 8.2Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7.7 14.7c3.8.15 6.9-2.65 8.25-6.5M9.2 10.9c1.85.15 3.55 1.2 4.35 2.95M12 17.6v-3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Field({ label, value }) {
  return (
    <div className="intake-field">
      <dt>{label}</dt>
      <dd>{value?.trim() || <span className="intake-unknown">Unknown</span>}</dd>
    </div>
  );
}

export default function CustomerIntake({ open, onClose }) {
  const [provider, setProvider] = useState(null);
  const [messages, setMessages] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefReady, setBriefReady] = useState(false);
  const [savedBrief, setSavedBrief] = useState(null);
  const [savedNotice, setSavedNotice] = useState("");
  const [tab, setTab] = useState("conversation");
  const [draft, setDraft] = useState("");
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendingText, setSendingText] = useState("");
  const [copyState, setCopyState] = useState("");
  const textareaRef = useRef(null);
  const dialogRef = useRef(null);
  const feedRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (stored?.brief && typeof stored.brief.title === "string") {
        setSavedBrief(stored);
        setBrief(stored.brief);
        setBriefReady(stored.ready === true);
      }
    } catch {
      // A stale or blocked local storage value should not prevent intake.
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.requestAnimationFrame(() => textareaRef.current?.focus());
    let current = true;
    setLoadingProvider(true);
    fetch("/api/intake")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not check Gemini setup.");
        return data;
      })
      .then((data) => { if (current) setProvider(data); })
      .catch((reason) => { if (current) setProvider({ error: reason.message }); })
      .finally(() => { if (current) setLoadingProvider(false); });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.hasAttribute("hidden") && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      current = false;
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (tab === "conversation" && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, busy, error, tab]);

  if (!open) return null;

  const canSend = provider?.configured && provider?.canUse && !loadingProvider;
  const displayBrief = brief || savedBrief?.brief;
  const displayReady = brief ? briefReady : savedBrief?.ready === true;
  const currentBriefIsSaved = Boolean(savedBrief && displayBrief && JSON.stringify(savedBrief.brief) === JSON.stringify(displayBrief));

  async function sendMessage() {
    const content = draft.trim();
    if (!content || busy || !canSend) return;
    if (messages.length >= 16) return;
    const history = [...messages, { role: "user", content }];
    setBusy(true);
    setSendingText(content);
    setError("");
    setSavedNotice("");
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gemini could not respond. Your message is still here; retry when ready.");
      setMessages((previous) => [...previous, { role: "user", content }, { role: "assistant", content: data.reply }]);
      setBrief(data.brief);
      setBriefReady(data.ready === true);
      setTab("conversation");
      setDraft("");
    } catch (reason) {
      setError(reason.message || "Could not reach Gemini. Your message is still here; retry when ready.");
    } finally {
      setBusy(false);
      setSendingText("");
    }
  }

  function saveBrief() {
    if (!brief) return;
    const stored = { brief, ready: briefReady, savedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setSavedBrief(stored);
      setSavedNotice("Saved in this browser. Ready for the reproduction runtime.");
    } catch {
      setError("This browser could not save local data. You can still copy or download the brief.");
    }
  }

  async function copyBrief() {
    const currentBrief = brief || savedBrief?.brief;
    if (!currentBrief) return;
    try {
      await navigator.clipboard.writeText(briefMarkdown(currentBrief));
      setCopyState("Copied");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch {
      setCopyState("Clipboard unavailable");
      window.setTimeout(() => setCopyState(""), 2400);
    }
  }

  function downloadBrief() {
    const currentBrief = brief || savedBrief?.brief;
    if (!currentBrief) return;
    const blob = new Blob([briefMarkdown(currentBrief)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(currentBrief.title || "incident-brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "incident-brief"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function startNewIntake() {
    if (brief) {
      const stored = { brief, ready: briefReady, savedAt: new Date().toISOString() };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        setSavedBrief(stored);
        setSavedNotice("Saved in this browser. Ready for the reproduction runtime.");
      } catch {
        setError("This browser could not save the current brief. Copy or download it before starting a new report.");
        return;
      }
    }
    setMessages([]);
    setBrief(null);
    setBriefReady(false);
    setDraft("");
    setError("");
    setTab("conversation");
    textareaRef.current?.focus();
  }

  return (
    <div className="intake-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section
        className="intake-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-title"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="intake-header">
          <div className="intake-brand">
            <PatchMark />
            <div>
              <h2 id="intake-title">Customer intake</h2>
              <p>Patch · incident report</p>
            </div>
          </div>
          <div className="intake-header-actions">
            <span className={`intake-model ${provider?.configured ? "ready" : ""}`}>
              <span className="intake-status-dot" />
              {loadingProvider ? "Checking Gemini" : provider?.configured ? modelLabel(provider.model) : "Gemini setup needed"}
            </span>
            <button className="intake-close" type="button" onClick={onClose} aria-label="Close customer intake">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
            </button>
          </div>
        </header>

        <div className="intake-tabbar">
          <div className="intake-tabs" role="tablist" aria-label="Intake views">
            <button type="button" role="tab" id="intake-tab-conversation" aria-selected={tab === "conversation"} aria-controls="intake-conversation" className={tab === "conversation" ? "active" : ""} onClick={() => setTab("conversation")}>Conversation</button>
            <button type="button" role="tab" id="intake-tab-brief" aria-selected={tab === "brief"} aria-controls="intake-brief" className={tab === "brief" ? "active" : ""} disabled={!brief && !savedBrief} onClick={() => setTab("brief")}>Incident brief{brief || savedBrief ? <span className="intake-tab-dot" /> : null}</button>
          </div>
          {messages.length || brief ? <button type="button" className="intake-new-report" onClick={startNewIntake}>{brief ? "Save & new" : "New report"}</button> : null}
        </div>

        <div id="intake-conversation" role="tabpanel" aria-labelledby="intake-tab-conversation" hidden={tab !== "conversation"} className="intake-conversation">
          <div className="intake-feed" ref={feedRef} aria-live="polite" aria-relevant="additions text">
            <div className="intake-greeting">
              <span className="intake-greeting-mark"><PatchMark /></span>
              <div>
                <div className="intake-greeting-by">Patch support</div>
                <h3>Tell us what went wrong.</h3>
                <p>Start wherever it makes sense. I’ll help capture what you saw, what you expected, and how to reproduce it.</p>
              </div>
            </div>
            {messages.map((message, index) => (
              <article className={`intake-message ${message.role}`} key={`${index}-${message.role}`}>
                {message.role === "assistant" ? <PatchMark /> : null}
                <div className="intake-message-content">
                  <div className="intake-message-label">{message.role === "assistant" ? "Patch support" : "You"}</div>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {busy ? (
              <article className="intake-message user pending">
                <div className="intake-message-content"><div className="intake-message-label">You</div><p>{sendingText}</p></div>
              </article>
            ) : null}
            {busy ? <div className="intake-thinking" role="status"><span /><span /><span /> Gemini is gathering the details</div> : null}
            {loadingProvider ? <div className="intake-config-card" role="status">Checking the Gemini connection…</div> : null}
            {!loadingProvider && !provider?.configured && !provider?.error ? (
              <div className="intake-config-card"><strong>Gemini is not connected yet.</strong><p>Add <code>GEMINI_API_KEY</code> to <code>.env.local</code> and restart Patch to enable customer intake.</p></div>
            ) : null}
            {!loadingProvider && provider?.error ? <div className="intake-config-card" role="alert">{provider.error}</div> : null}
            {!loadingProvider && provider?.configured && !provider?.canUse ? (
              <div className="intake-config-card">An approver account is needed to generate a brief with Gemini.</div>
            ) : null}
            {error ? <div className="intake-error" role="alert"><p>{error}</p>{provider?.configured && provider?.canUse && messages.length < 16 ? <button type="button" onClick={sendMessage} disabled={busy || !draft.trim()}>Retry</button> : null}</div> : null}
            {savedNotice ? <div className="intake-saved" role="status">{savedNotice}</div> : null}
            {messages.length >= 16 ? (
              <div className="intake-config-card"><strong>This conversation has reached its context limit.</strong><p>The current brief will be saved in this browser when you start a fresh intake.</p><button className="intake-new" type="button" onClick={startNewIntake}>Save brief and start a new intake</button></div>
            ) : null}
            {savedBrief && !messages.length && !brief ? <div className="intake-config-card">A saved incident brief is available in the Incident brief tab.</div> : null}
            {!messages.length && !busy ? (
              <button className="intake-example" type="button" onClick={() => { setDraft(SAMPLE_REPORT); textareaRef.current?.focus(); }}>
                <span>Try an example</span>
                <span>Duplicate bookings after clicking Reserve <b aria-hidden="true">↗</b></span>
              </button>
            ) : null}
          </div>
          <form className="intake-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <label className="sr-only" htmlFor="intake-message">Describe the issue</label>
            <textarea
              ref={textareaRef}
              id="intake-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder={messages.length >= 16 ? "Start a new intake to continue" : canSend ? "Describe what happened…" : "Gemini intake is unavailable"}
              rows={3}
              maxLength={2000}
              disabled={!canSend || busy || messages.length >= 16}
              aria-describedby="intake-composer-help"
            />
            <div className="intake-composer-foot">
              <span id="intake-composer-help">Please leave out passwords, payment details, and private account information.</span>
              <button className="intake-send" type="submit" disabled={!canSend || busy || messages.length >= 16 || !draft.trim()} aria-label="Send message">
                {busy ? <span className="intake-spinner" aria-hidden="true" /> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10h12m-5-5 5 5-5 5" /></svg>}
              </button>
            </div>
          </form>
        </div>

        <div id="intake-brief" role="tabpanel" aria-labelledby="intake-tab-brief" hidden={tab !== "brief"} className="intake-brief-view">
          {displayBrief ? (
            <>
              <div className="intake-brief-topline">
                <div><span className={`intake-brief-status ${displayReady ? "ready" : ""}`}>{displayReady ? "Ready to share" : "Still gathering details"}</span>{currentBriefIsSaved ? <span className="intake-saved-label">Saved in this browser</span> : null}</div>
                <div className="intake-brief-actions">
                  <button type="button" onClick={copyBrief}>{copyState || "Copy Markdown"}</button>
                  <button type="button" onClick={downloadBrief}>Download</button>
                </div>
              </div>
              <article className="intake-brief-card">
                <div className="intake-brief-eyebrow">INCIDENT REPORT</div>
                <h3>{displayBrief.title || "Incident report"}</h3>
                <dl>
                  <Field label="Summary" value={displayBrief.summary} />
                  <div className="intake-field-pair"><Field label="Expected" value={displayBrief.expected} /><Field label="Actual" value={displayBrief.actual} /></div>
                  <Field label="Environment" value={displayBrief.environment} />
                  <div className="intake-field">
                    <dt>Reproduction steps</dt>
                    <dd>{displayBrief.steps?.length ? <ol>{displayBrief.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : <span className="intake-unknown">Unknown</span>}</dd>
                  </div>
                  <div className="intake-field">
                    <dt>Still unknown</dt>
                    <dd>{displayBrief.unknowns?.length ? <ul>{displayBrief.unknowns.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <span className="intake-unknown">None marked</span>}</dd>
                  </div>
                </dl>
              </article>
              {brief ? <><div className="intake-brief-note">Saving this brief keeps it in this browser. It does not start an investigation.</div><button className="intake-save" type="button" onClick={saveBrief}>Save brief in this browser</button></> : <div className="intake-brief-note">This saved brief is stored in this browser.</div>}
              {savedNotice ? <div className="intake-saved" role="status">{savedNotice}</div> : null}
            </>
          ) : (
            <div className="intake-brief-empty"><span className="intake-brief-icon"><PatchMark /></span><h3>Your incident brief will take shape here.</h3><p>As you share details, Gemini will organize them into a clear report and mark anything that is still unknown.</p><button type="button" onClick={() => setTab("conversation")}>Back to conversation</button></div>
          )}
        </div>
      </section>
    </div>
  );
}
