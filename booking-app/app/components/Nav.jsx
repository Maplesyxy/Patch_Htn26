export default function Nav({ account = "A-1001" }) {
  const q = `?account=${encodeURIComponent(account)}`;
  return (
    <nav className="nav">
      <a className="brand" href={`/${q}`}>Tablewise</a>
      <div className="nav-links">
        <a href={`/${q}`}>Restaurants</a>
        <a href={`/reservations${q}`}>My reservations</a>
        <a href={`/feedback${q}`}>Report a problem</a>
      </div>
      <span className="nav-account">{account}</span>
    </nav>
  );
}
