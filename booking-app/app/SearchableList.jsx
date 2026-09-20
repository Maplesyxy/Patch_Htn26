"use client";

import { useState } from "react";
import { RESTAURANTS } from "@/lib/restaurants";

const money = (n) => "££££".slice(0, n);

export default function SearchableList({ account }) {
  const [q, setQ] = useState("");
  const query = q.trim();
  const shown = query
    ? RESTAURANTS.filter((r) => r.name.includes(query) || r.cuisine.includes(query) || r.area.includes(query))
    : RESTAURANTS;
  const link = `?account=${encodeURIComponent(account)}`;

  return (
    <>
      <div className="searchbar">
        <label htmlFor="q" className="visually-hidden">Search restaurants</label>
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by name, cuisine or area" />
      </div>

      {shown.length === 0 ? (
        <p className="muted">No restaurants match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="cards">
          {shown.map((r) => (
            <li key={r.id} className="card restaurant">
              <div className="card-head">
                <h2>{r.name}</h2>
                <span className="rating">{r.rating.toFixed(1)}</span>
              </div>
              <p className="meta">{r.cuisine} · {r.area} · {money(r.price)}</p>
              <p className="blurb">{r.blurb}</p>
              <a className="cta" href={`/restaurants/${r.id}${link}`}>See times</a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
