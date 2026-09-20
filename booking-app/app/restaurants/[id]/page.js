import Nav from "../../components/Nav";
import { SLOTS, byId } from "@/lib/restaurants";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  const r = byId(id);

  if (!r) {
    return (<><Nav account={account} /><main><h1>Not found</h1>
      <p className="muted">No restaurant with that id.</p><a className="cta" href="/">Back</a></main></>);
  }

  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>{r.name}</h1>
          <p className="muted">{r.cuisine} · {r.area} · rated {r.rating.toFixed(1)}</p>
          <p>{r.blurb}</p>
        </header>

        <section className="card">
          <h2>Tonight&rsquo;s sittings</h2>
          <ul className="slots">
            {SLOTS.map((s) => (
              <li key={s}><a href={`/book?account=${encodeURIComponent(account)}&restaurant=${r.id}&slot=${encodeURIComponent(s)}`}>{s}</a></li>
            ))}
          </ul>
          <p className="muted small">Tables seat up to 8. Larger parties are handled by our events team.</p>
        </section>
      </main>
    </>
  );
}
