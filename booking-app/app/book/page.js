import Nav from "../components/Nav";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  const restaurant = sp?.restaurant || "hearth";
  return (
    <>
      <Nav account={account} />
      <main>
        <h1>Book a table</h1>
        <BookingForm account={account} restaurant={restaurant} slot={sp?.slot} />
      </main>
    </>
  );
}
