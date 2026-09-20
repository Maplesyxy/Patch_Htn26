import Nav from "./components/Nav";
import { RESTAURANTS } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

const money = (n) => "££££".slice(0, n);

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  const q = `?account=${encodeURIComponent(account)}`;

  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>Find a table tonight</h1>
          <p className="muted">Six kitchens, no booking fee, instant confirmation.</p>
        </header>

        <ul className="cards">
          {RESTAURANTS.map((r) => (
            <li key={r.id} className="card restaurant">
              <div className="card-head">
                <h2>{r.name}</h2>
                <span className="rating">{r.rating.toFixed(1)}</span>
              </div>
              <p className="meta">{r.cuisine} · {r.area} · {money(r.price)}</p>
              <p className="blurb">{r.blurb}</p>
              <a className="cta" href={`/restaurants/${r.id}${q}`}>See times</a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
