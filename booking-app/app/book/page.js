import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp && sp.account) ? sp.account : "A-1001";
  return (
    <main>
      <h1>Book a table</h1>
      <BookingForm account={account} />
    </main>
  );
}
