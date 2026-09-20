"use client";

import { useEffect, useState } from "react";
import { newRequestIds, postBooking } from "@/lib/apiClient";
import { PARTY_SIZES, SLOTS, TABLES_PER_SLOT, byId } from "@/lib/restaurants";

export default function BookingForm({ account, restaurant, slot: initialSlot }) {
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(SLOTS.includes(initialSlot) ? initialSlot : "19:00");
  const [party, setParty] = useState(2);
  // 2026-09-12: double bookings reported. Guard the button so one click is one
  // booking, then stop the form being submitted twice. See CHANGELOG.
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState(null);
  const [avail, setAvail] = useState(null);

  const place = byId(restaurant);

  async function refresh() {
    try {
      const res = await fetch(`/api/sandbox/reservations?account=${encodeURIComponent(account)}`, { cache: "no-store" });
      const d = await res.json();
      setMine(d.reservations || []);
    } catch { /* the list is decoration; the form still works */ }
  }

  useEffect(() => { refresh(); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAvailability() {
    if (!date) { setAvail(null); return; }
    try {
      const res = await fetch(`/api/availability?restaurant=${encodeURIComponent(restaurant)}&date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const d = await res.json();
      setAvail(res.ok ? d.availability : null);
    } catch { setAvail(null); }
  }

  useEffect(() => { loadAvailability(); }, [date, restaurant]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const d = await postBooking({ account, date, slot, restaurant, party_size: party }, newRequestIds());
      setResult(d);
    } catch (err) {
      setError(err.message || "Could not reach the server.");
    } finally {
      setSubmitting(false);
      refresh();
      loadAvailability();
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit}>
        <p className="account">{place ? place.name : "Table"} · account <code>{account}</code></p>

        <label htmlFor="date">Date</label>
        <input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        <label htmlFor="slot">Time</label>
        <select id="slot" name="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
          {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {avail && avail[slot] ? (
          <p className="availability">
            <span className={avail[slot].remaining === 0 ? "tables-none" : "tables-left"}>
              {avail[slot].remaining} of {avail[slot].tables} tables left
            </span>{" "}at {slot}
          </p>
        ) : (
          <p className="availability muted">Pick a date to see what is free.</p>
        )}

        <label htmlFor="party">Party size</label>
        <select id="party" name="party" value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {PARTY_SIZES.map((n) => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}
        </select>

        <button type="submit" disabled={submitting}>{submitting ? "Booking…" : "Book"}</button>
      </form>

      {error ? <p className="msg bad" role="alert">{error}</p> : null}
      {result ? (
        <p className="msg good" role="status">
          Booked. Confirmation {result.reservation.id} for {result.reservation.date} at {result.reservation.slot},
          party of {result.party_size}.
        </p>
      ) : null}

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
