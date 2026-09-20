"use client";

import { useState } from "react";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign-in failed.");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-box">
        <h1>Repro console</h1>
        <p className="muted">Sign in to watch investigations. Approvers can also add evidence and sign off on pull requests and customer replies.</p>
        <label htmlFor="name">Your name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Recorded on every approval" />
        <label htmlFor="pw">Team password</label>
        <input
          id="pw" type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
        />
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn primary" onClick={signIn} disabled={busy || !name || !password}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </div>
    </main>
  );
}
