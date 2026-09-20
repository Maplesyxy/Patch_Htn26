"use client";

import { useState } from "react";
import PatchIcon from "@/components/PatchIcon";
import { PatchMark } from "@/components/PatchShell";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    if (event) event.preventDefault();
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
      <form className="login-box" onSubmit={signIn}>
        <a className="patch-brand" href="/" aria-label="Patch home"><PatchMark size={34} /><span>patch</span></a>
        <h1>Welcome to Patch</h1>
        <p className="muted">Sign in to follow investigations, add evidence, and approve release decisions.</p>
        <label htmlFor="name">Your name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Recorded on approvals" required />
        <label htmlFor="pw">Team password</label>
        <input id="pw" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="patch-button patch-button-primary" type="submit" disabled={busy || !name || !password}>
          {busy ? "Signing in…" : "Sign in"}
          {!busy ? <PatchIcon name="arrowRight" size={15} /> : null}
        </button>
        <p className="patch-login-foot"><PatchIcon name="shield" size={13} />Your approvals are recorded with your name.</p>
      </form>
    </main>
  );
}
