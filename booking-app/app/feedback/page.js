import Nav from "../components/Nav";
import FeedbackForm from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }) {
  const sp = await searchParams;
  const account = /^A-\d{4}$/.test(sp?.account) ? sp.account : "A-1001";
  return (
    <>
      <Nav account={account} />
      <main>
        <header className="hero">
          <h1>Report a problem</h1>
          <p className="muted">
            Tell us what went wrong in your own words. You do not need to know why it happened.
          </p>
        </header>
        <FeedbackForm account={account} />
      </main>
    </>
  );
}
