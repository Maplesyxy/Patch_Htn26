"""Turns a QA engineer's chosen environment names into a real BrowserLab matrix run.

The reproduction steps are fixed code, not something the model writes at run time: the
steps describe the booking flow, and the environments are the variable. That is the
one-variable-at-a-time discipline in team/agents/qa-engineer.md, and it keeps a live
demo off the knife-edge of a model inventing a selector.
"""
import json
import urllib.request

from browser_lab import BrowserLab, Env
from tools import ENVIRONMENTS


def _sandbox(target, admin, path, method="GET"):
    req = urllib.request.Request(target + path, method=method, headers={"x-sandbox-admin": admin})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"{}")


def build_envs(names):
    envs = []
    for n in names:
        spec = dict(ENVIRONMENTS[n])
        envs.append(Env(
            name=n,
            provider=spec["provider"],
            engine=spec.get("engine", "chromium"),
            device=spec.get("device"),
            viewport=spec.get("viewport"),
            block_ads=spec.get("block_ads", False),
            fault=spec.get("fault", "none"),
            fault_url="**/api/bookings",
        ))
    return envs


def run_experiment(bus, agent, experiment_id, target, admin, env_names, runs, account="A-1001", date="2026-10-03"):
    """One click on the booking form, in every chosen environment. Returns {matrix, attribution}."""

    def reset():
        _sandbox(target, admin, "/api/sandbox/reset", "POST")

    def steps(page, tgt):
        page.goto(f"{tgt}/book?account={account}", wait_until="domcontentloaded")
        page.get_by_label("Date").fill(date)
        page.get_by_role("button", name="Book").click()   # exactly one click
        page.wait_for_timeout(6000)                       # long enough for a client retry

    def observe():
        # The system of record, not the UI. Two confirmation toasts are not two reservations.
        rows = _sandbox(target, admin, f"/api/sandbox/reservations?account={account}")["reservations"]
        return len(rows) > 1

    lab = BrowserLab(bus, agent)
    result = lab.run_matrix(experiment_id, target, steps, observe,
                            envs=build_envs(env_names), runs=runs, reset=reset)
    total = sum(r["runs"] for r in result["matrix"])
    failed = sum(r["failed"] for r in result["matrix"])
    infra = sum(r["infra"] for r in result["matrix"])
    result["observed"] = f"{failed}/{total} runs produced more than one reservation from a single click"
    result["infra_failures"] = infra
    result["conditions"] = {"clicks": 1, "account": account, "date": date,
                            "environments": len(env_names), "runs_per_environment": runs}
    return result
