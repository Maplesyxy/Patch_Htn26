"use client";

import { useState } from "react";
import { RESTAURANTS } from "@/lib/restaurants";

export default function FeedbackForm({ account }) {
  const [kind, setKind] = useState("bug");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [rating, setRating] = useState(3);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSending(true); setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, subject, body, account, restaurant: restaurant || null,
          rating: kind === "review" ? rating : null,
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "That did not send."); return; }
      setSent(d.id); setSubject(""); setBody("");
    } catch {
      setError("Could not reach us. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="card">
        <p className="msg good" role="status">
          Thank you. Your report is <code>{sent}</code>. Our engineers see it immediately.
        </p>
        <button className="secondary" onClick={() => setSent(null)}>Send another</button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <fieldset className="kind">
        <legend>What is this?</legend>
        <label><input type="radio" name="kind" value="bug" checked={kind === "bug"} onChange={() => setKind("bug")} /> Something is broken</label>
        <label><input type="radio" name="kind" value="review" checked={kind === "review"} onChange={() => setKind("review")} /> A review</label>
      </fieldset>

      <label htmlFor="subject">Summary</label>
      <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}
             placeholder={kind === "bug" ? "e.g. I was booked twice" : "e.g. Lovely evening"} required />

      <label htmlFor="detail">What happened?</label>
      <textarea id="detail" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="In your own words. Anything you remember helps: what you clicked, what you expected, what you saw."
                required />

      <label htmlFor="place">Which restaurant? (optional)</label>
      <select id="place" value={restaurant} onChange={(e) => setRestaurant(e.target.value)}>
        <option value="">Not about a specific restaurant</option>
        {RESTAURANTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>

      {kind === "review" ? (
        <>
          <label htmlFor="rating">Rating</label>
          <select id="rating" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
          </select>
        </>
      ) : null}

      {error ? <p className="msg bad" role="alert">{error}</p> : null}

      <button type="submit" disabled={sending || !subject.trim() || !body.trim()}>
        {sending ? "Sending…" : "Send report"}
      </button>
      <p className="small muted">
        We record your account id only. Please do not include your name, email address or card details.
      </p>
    </form>
  );
}
