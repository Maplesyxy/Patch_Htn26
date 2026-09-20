import Nav from "../components/Nav";
import { byId } from "@/lib/restaurants";
import { listReservations } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Reservations({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  const rows = await listReservations(account);

  // Chronological: earliest first.
  const ordered = [...rows].sort((a, b) => (`${a.date} ${a.slot}` < `${b.date} ${b.slot}` ? -1 : 1));

  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>My reservations</h1>
          <p className="muted">{ordered.length === 0 ? "Nothing booked yet." : `${ordered.length} booking${ordered.length === 1 ? "" : "s"}.`}</p>
        </header>

        {ordered.length === 0 ? (
          <p><a className="cta" href={`/?account=${account}`}>Find a table</a></p>
        ) : (
          <ul className="cards">
            {ordered.map((r) => {
              const place = byId(r.restaurant);
              return (
                <li key={r.id} className="card reservation">
                  <div className="card-head">
                    <h2>{place ? place.name : "Table"}</h2>
                    <code>{r.id}</code>
                  </div>
                  <p className="meta">{r.date} at {r.slot}</p>
                  <p className="blurb">Party of {r.party_size ?? 2}</p>
                </li>
              );
            })}
          </ul>
        )}

        <p className="small muted">
          Something look wrong? <a href={`/feedback?account=${account}`}>Tell us</a>.
        </p>
      </main>
    </>
  );
}
