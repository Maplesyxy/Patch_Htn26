"""Parallel reproduction strategies: clone the execution agent 2-3 ways and race them.

The environment matrix answers one question well ("is it the website or the browser?")
and is the wrong shape for most defects. A cancel that silently fails, a list that
truncates, a confirmation that disagrees with the database -- none of those need a second
browser engine. They need a different *kind* of experiment.

So the swarm forks. Each probe is an independent hypothesis about HOW to make the failure
appear, they run concurrently against isolated accounts, and the first to reproduce wins.
Losers are still reported: "we tried X and it did not fail" is evidence, and it is what
stops a supervisor from chasing a theory that has already been ruled out.
"""
import concurrent.futures
import json
import time
import urllib.error
import urllib.request


class ProbeError(Exception):
    """Infrastructure, not evidence."""


def _call(target, path, method="GET", admin="", body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        target + path, data=data, method=method,
        headers={"x-sandbox-admin": admin, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise ProbeError(f"{method} {path} -> {e.code}") from None
    except Exception as e:
        raise ProbeError(f"{method} {path} -> {type(e).__name__}") from None


# --------------------------------------------------------------------------- strategies
#
# Each takes an isolated account so probes cannot corrupt each other's observations,
# and returns (reproduced: bool, observation: str, evidence: dict).

def probe_repeat_action(ctx):
    """Do the same thing twice. Catches missing uniqueness and idempotency on the write path."""
    acct = ctx["account"]
    payload = {"account": acct, "date": ctx["date"], "slot": ctx["slot"], "restaurant": ctx["restaurant"]}
    for _ in range(2):
        _call(ctx["target"], "/api/bookings", "POST", ctx["admin"], payload)
    rows = _call(ctx["target"], f"/api/sandbox/reservations?account={acct}", admin=ctx["admin"])["reservations"]
    n = len(rows)
    return (n > 1,
            f"Two identical booking attempts produced {n} reservation(s). One was expected.",
            {"reservations": n, "ids": [r["id"] for r in rows]})


def probe_state_after_action(ctx):
    """Act, then re-read the system of record. Catches writes that the read path contradicts."""
    acct = ctx["account"]
    created = _call(ctx["target"], "/api/bookings", "POST", ctx["admin"],
                    {"account": acct, "date": ctx["date"], "slot": ctx["slot"], "restaurant": ctx["restaurant"]})
    rid = created["reservation"]["id"]
    _call(ctx["target"], f"/api/reservations/{rid}", "DELETE", ctx["admin"])
    after = _call(ctx["target"], f"/api/sandbox/reservations?account={acct}", admin=ctx["admin"])["reservations"]
    still_there = any(r["id"] == rid for r in after)
    return (still_there,
            f"Cancelled {rid}; the request succeeded and the reservation is "
            + ("still listed afterwards." if still_there else "gone, as expected."),
            {"reservation": rid, "listed_after_cancel": still_there})


def probe_confirmation_vs_record(ctx):
    """Compare what the response claims against what was stored. Catches silent coercion."""
    acct = ctx["account"]
    asked = 12
    created = _call(ctx["target"], "/api/bookings", "POST", ctx["admin"],
                    {"account": acct, "date": ctx["date"], "slot": ctx["slot"],
                     "restaurant": ctx["restaurant"], "party_size": asked})
    echoed = created.get("party_size")
    stored = created["reservation"].get("party_size")
    return (echoed != stored,
            f"Confirmation says a party of {echoed}; the stored reservation is for {stored}.",
            {"requested": asked, "confirmed": echoed, "stored": stored})


def probe_volume(ctx):
    """Push past a plausible page size. Catches truncation that nothing announces."""
    acct = ctx["account"]
    want = 13
    for i in range(want):
        _call(ctx["target"], "/api/bookings", "POST", ctx["admin"],
              {"account": acct, "date": f"2026-12-{(i % 9) + 1:02d}", "slot": ctx["slot"],
               "restaurant": ctx["restaurant"]})  # volume keys on the account, not the sitting
    shown = len(_call(ctx["target"], f"/api/sandbox/reservations?account={acct}", admin=ctx["admin"])["reservations"])
    logged = _call(ctx["target"], f"/api/sandbox/requests?account={acct}&path=/api/bookings", admin=ctx["admin"])["count"]
    return (shown < logged,
            f"Created {logged} bookings; the customer's list shows {shown}. "
            + ("The difference is not reported anywhere." if shown < logged else "They agree."),
            {"created": logged, "visible": shown})


def probe_capacity(ctx):
    """Oversubscribe one sitting. Catches limits that are displayed but never enforced."""
    acct = ctx["account"]
    payload = {"account": acct, "date": ctx["date"], "slot": ctx["slot"], "restaurant": ctx["restaurant"]}
    before = _call(ctx["target"], f"/api/availability?restaurant={ctx['restaurant']}&date={ctx['date']}",
                   admin=ctx["admin"])["availability"][ctx["slot"]]
    for _ in range(before["tables"] + 2):
        _call(ctx["target"], "/api/bookings", "POST", ctx["admin"], payload)
    after = _call(ctx["target"], f"/api/availability?restaurant={ctx['restaurant']}&date={ctx['date']}",
                  admin=ctx["admin"])["availability"][ctx["slot"]]
    booked = len(_call(ctx["target"], f"/api/sandbox/reservations?account={acct}", admin=ctx["admin"])["reservations"])
    broken = booked > before["tables"] or after["remaining"] == before["remaining"]
    return (broken,
            f"{before['tables']} tables; {booked} bookings accepted; availability went from "
            f"{before['remaining']} to {after['remaining']} left.",
            {"tables": before["tables"], "accepted": booked,
             "remaining_before": before["remaining"], "remaining_after": after["remaining"]})


STRATEGIES = {
    "repeat_action": (probe_repeat_action, "Repeat the same action and count the results."),
    "state_after_action": (probe_state_after_action, "Act, then re-read the system of record."),
    "confirmation_vs_record": (probe_confirmation_vs_record, "Compare the confirmation against what was stored."),
    "volume": (probe_volume, "Push past a plausible page size."),
    "capacity": (probe_capacity, "Oversubscribe a limit the interface advertises."),
}


def run_probes(target, admin, names, restaurant="nori", date="2026-11-14", slot="19:00",
               base_account=7000, on_event=None, max_workers=3):
    """Race the chosen strategies. Returns every result, winner first.

    Each probe gets its own account so concurrent bookings cannot pollute another's count.
    """
    chosen = [n for n in names if n in STRATEGIES]
    if not chosen:
        raise ProbeError(f"No known strategies in {names!r}. Available: {', '.join(STRATEGIES)}")

    def one(i, name):
        fn, _desc = STRATEGIES[name]
        # A separate account is not enough isolation: availability is counted per
        # (restaurant, date, slot) with no account filter, so two probes on the same
        # sitting would read each other's bookings. Give each probe its own date.
        base_day = int(date.split("-")[2])
        probe_date = f"{date.rsplit('-', 1)[0]}-{min(28, base_day + i):02d}"
        ctx = {"target": target.rstrip("/"), "admin": admin, "restaurant": restaurant,
               "date": probe_date, "slot": slot, "account": f"A-{base_account + i}"}
        started = time.time()
        if on_event:
            on_event(name, "start", f"{name}: {STRATEGIES[name][1]}")
        try:
            reproduced, observation, evidence = fn(ctx)
            out = {"strategy": name, "reproduced": bool(reproduced), "observation": observation,
                   "evidence": evidence, "account": ctx["account"],
                   "seconds": round(time.time() - started, 2), "status": "ok"}
        except ProbeError as e:
            out = {"strategy": name, "reproduced": False, "observation": f"Infrastructure failure: {e}",
                   "evidence": {}, "account": ctx["account"],
                   "seconds": round(time.time() - started, 2), "status": "infra"}
        if on_event:
            on_event(name, "ok" if out["status"] == "ok" else "error", out["observation"])
        return out

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(max_workers, len(chosen))) as pool:
        futures = {pool.submit(one, i, n): n for i, n in enumerate(chosen)}
        for fut in concurrent.futures.as_completed(futures):
            results.append(fut.result())

    ok = [r for r in results if r["status"] == "ok"]
    hits = sorted([r for r in ok if r["reproduced"]], key=lambda r: r["seconds"])
    misses = [r for r in ok if not r["reproduced"]]
    infra = [r for r in results if r["status"] == "infra"]

    return {
        "strategies_run": len(results),
        "reproduced_by": [r["strategy"] for r in hits],
        "ruled_out": [r["strategy"] for r in misses],
        "infrastructure_failures": [r["strategy"] for r in infra],
        "winner": hits[0] if hits else None,
        "results": hits + misses + infra,
    }
