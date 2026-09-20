"use client";

import { useEffect, useState } from "react";
import { newRequestIds, postBooking } from "@/lib/apiClient";

const SLOTS = ["12:00", "12:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

export default function BookingForm({ account }) {
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("19:00");
  // 2026-09-12: double bookings reported. Guard the button so one click is one
  // booking, then stop the form being submitted twice. See CHANGELOG.
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/sandbox/reservations?account=${encodeURIComponent(account)}`, { cache: "no-store" });
      const d = await res.json();
      setMine(d.reservations || []);
    } catch { /* the list is decoration; the form still works */ }
  }

  useEffect(() => { refresh(); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const d = await postBooking({ account, date, slot }, newRequestIds());
      setResult(d.reservation);
    } catch (err) {
      setError(err.message || "Could not reach the server.");
    } finally {
      setSubmitting(false);
      refresh();
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit}>
        <p className="account">Account <code>{account}</code></p>

        <label htmlFor="date">Date</label>
        <input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        <label htmlFor="slot">Time</label>
        <select id="slot" name="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
          {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <button type="submit" disabled={submitting}>{submitting ? "Booking…" : "Book"}</button>
      </form>

      {error ? <p className="msg bad" role="alert">{error}</p> : null}
      {result ? <p className="msg good" role="status">Booked. Confirmation {result.id} for {result.date} at {result.slot}.</p> : null}

      <section className="mine">
        <h2>Your reservations</h2>
        {mine === null ? <p className="muted">Loading</p> : mine.length === 0 ? <p className="muted">None yet.</p> : (
          <ul>
            {mine.map((r) => <li key={r.id}><code>{r.id}</code> {r.date} at {r.slot}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
