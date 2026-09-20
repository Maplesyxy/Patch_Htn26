import Nav from "../components/Nav";
import ReservationList from "./ReservationList";

export const dynamic = "force-dynamic";

export default async function Reservations({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>My reservations</h1>
          <p className="muted">Everything you have booked.</p>
        </header>
        <ReservationList account={account} />
        <p className="small muted">
          Something look wrong? <a href={`/feedback?account=${account}`}>Tell us</a>.
        </p>
      </main>
    </>
  );
}
