import Nav from "./components/Nav";
import SearchableList from "./SearchableList";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";

  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>Find a table tonight</h1>
          <p className="muted">Six kitchens, no booking fee, instant confirmation.</p>
        </header>
        <SearchableList account={account} />
      </main>
    </>
  );
}
