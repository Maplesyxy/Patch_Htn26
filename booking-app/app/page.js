export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <h1>Sandbox booking app</h1>
      <p className="muted">
        A deliberately small restaurant booking app, used as the system under test for the Repro agent team.
        Everything in it is synthetic: account ids only, no names or email addresses.
      </p>
      <p><a className="cta" href="/book?account=A-1001">Open the booking form</a></p>
      <section className="mine">
        <h2>Sandbox API</h2>
        <ul>
          <li><code>POST /api/bookings</code> create a reservation</li>
          <li><code>POST /api/sandbox/reset</code> restore the seeded state (needs <code>x-sandbox-admin</code>)</li>
          <li><code>GET /api/sandbox/reservations?account=A-1001</code> the system of record</li>
          <li><code>GET /api/sandbox/requests?account=A-1001</code> the request log</li>
          <li><code>GET /api/sandbox/emails?account=A-1001</code> what was sent</li>
          <li><code>GET /api/health</code> store, branch, whether reset is guarded</li>
        </ul>
      </section>
    </main>
  );
}
