"use client";

import { useEffect, useState } from "react";
import { byId } from "@/lib/restaurants";

export default function ReservationList({ account }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    try {
      const res = await fetch(`/api/sandbox/reservations?account=${encodeURIComponent(account)}`, { cache: "no-store" });
      const d = await res.json();
      setRows(d.reservations || []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => { load(); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel(id) {
    setBusy(id);
    setNote("");
    // Take it off the list straight away so the page feels responsive.
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setNote(`${id} cancelled.`);
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy("");
    }
  }

  if (rows === null) return <p className="muted">Loading</p>;
  if (rows.length === 0) {
    return <p><a className="cta" href={`/?account=${account}`}>Find a table</a></p>;
  }

  // Chronological: earliest first.
  const ordered = [...rows].sort((a, b) => (`${a.date} ${a.slot}` < `${b.date} ${b.slot}` ? -1 : 1));

  return (
    <>
      {note ? <p className="msg good" role="status">{note}</p> : null}
      <ul className="cards">
        {ordered.map((r) => {
          const place = byId(r.restaurant);
          return (
            <li key={r.id} className="card reservation">
              <div className="card-head">
                <h2>{place ? place.name : "Table"}</h2>
                <code>{r.id}</code>
              </div>
              <p className="meta">{new Date(r.date).toLocaleDateString()} at {r.slot}</p>
              <p className="blurb">Party of {r.party_size ?? 2}</p>
              <button className="secondary" disabled={busy === r.id} onClick={() => cancel(r.id)}>
                {busy === r.id ? "Cancelling…" : "Cancel"}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
