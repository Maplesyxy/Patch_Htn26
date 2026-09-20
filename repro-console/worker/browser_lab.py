"""
browser_lab: run the same reproduction steps across a matrix of browser environments and
decide whether a failure belongs to the WEBSITE or to the BROWSER / customer environment.

Two providers, one interface:

  browserbase  Clean cloud Chromium, created per run. Nothing of the customer's machine (or yours)
               is in it: no extensions, no cache, no service worker, no VPN. Every session is
               video-recorded and can be watched live in the console. Options per environment:
               viewport, region, proxy geolocation, ad blocking, an uploaded extension, a persisted
               context (to test stale-cache / stale-login theories).
  local        Playwright on this machine. Needed for engines Browserbase does not run: Browserbase
               sessions are Chromium (you attach over CDP), so WebKit (Safari) and Firefox checks
               happen here, with Playwright device emulation for phones.

IMPORTANT: a Browserbase browser lives on the internet. It cannot open http://localhost. Point
`target` at a public URL: a Vercel preview deployment per branch works well (main vs fix/...),
or a tunnel (cloudflared / ngrok). If the preview is protected, use a protection-bypass token.

    pip install browserbase playwright && playwright install chromium webkit firefox
    export BROWSERBASE_API_KEY=...   BROWSERBASE_PROJECT_ID=...

Written against the Browserbase Python SDK docs (sessions.create / sessions.debug /
connect_over_cdp). The request shape was checked against browserbase-sdk-python 1.19.0 on
2026-09-19 (params and the JSON body it produces); the Playwright paths and anything that
needs a live account have still never run. Run example_browser_matrix.py once before relying
on it.
"""
import os
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

from playwright.sync_api import sync_playwright


# ----------------------------------------------------------------------------- environments
@dataclass
class Env:
    name: str
    provider: str = "browserbase"            # "browserbase" | "local"
    engine: str = "chromium"                 # local only: chromium | webkit | firefox
    device: Optional[str] = None             # local only: a Playwright device name, e.g. "iPhone 14"
    viewport: Optional[dict] = None          # {"width": 390, "height": 844}
    region: Optional[str] = None             # browserbase: e.g. "us-east-1"
    proxy_country: Optional[str] = None      # browserbase: route through a managed proxy in this country
    block_ads: bool = False                  # browserbase: built-in ad blocking (content-blocker theory)
    extension_id: Optional[str] = None       # browserbase: an extension you uploaded (extension theory)
    context_id: Optional[str] = None         # browserbase: persisted profile (stale cache / login theory)
    fault: str = "none"                      # none | drop_response | slow_response
    fault_url: str = "**/api/bookings"       # which request the fault applies to
    fault_times: int = 1                     # only the first N matching requests are hit, so a client retry gets through

    def detail(self):
        bits = [self.engine if self.provider == "local" else "chromium"]
        if self.device: bits.append(self.device)
        if self.viewport: bits.append(f"{self.viewport['width']}x{self.viewport['height']}")
        if self.region: bits.append(self.region)
        if self.proxy_country: bits.append(f"proxy {self.proxy_country}")
        if self.block_ads: bits.append("ad blocking on")
        if self.extension_id: bits.append("with extension")
        if self.context_id: bits.append("persisted profile")
        bits.append("clean network" if self.fault == "none" else self.fault.replace("_", " "))
        return ", ".join(bits)


def default_matrix(fault_url="**/api/bookings"):
    """Smallest matrix that separates 'website' from 'browser' from 'network condition'."""
    f = dict(fault_url=fault_url)
    return [
        # negative controls: a clean browser on a clean network must NOT fail
        Env("Cloud Chromium, desktop", viewport={"width": 1440, "height": 900}, **f),
        # the suspected trigger, in a browser that shares nothing with the customer
        Env("Cloud Chromium, desktop, lost response", viewport={"width": 1440, "height": 900}, fault="drop_response", **f),
        Env("Cloud Chromium, phone size, lost response", viewport={"width": 390, "height": 844}, fault="drop_response", **f),
        # other engines, locally
        Env("Safari engine, iPhone", provider="local", engine="webkit", device="iPhone 14", fault="drop_response", **f),
        Env("Firefox, desktop", provider="local", engine="firefox", fault="drop_response", **f),
        Env("Safari engine, iPhone, clean", provider="local", engine="webkit", device="iPhone 14", **f),
        # content-blocker theory
        Env("Cloud Chromium, ad blocking", viewport={"width": 1440, "height": 900}, block_ads=True, **f),
    ]


# ----------------------------------------------------------------------------- attribution
def attribute(rows):
    """
    rows: [{env, provider, engine, fault, runs, failed, infra}]
    Returns {verdict, because}. Verdicts:
      website_defect                 fails in a clean cloud browser too, so it is not the customer's browser
      website_defect_network_trigger same, but only when the network misbehaves
      browser_specific               fails only on some engines, under otherwise identical conditions
      environment_specific           fails only where the environment was customised (ad blocking,
                                     an extension, a persisted profile), not on the engine
      not_reproduced                 never failed (this is NOT 'not a bug')
      inconclusive                   too many infrastructure failures to say
    """
    usable = [r for r in rows if r["runs"] - r["infra"] > 0]
    if len(usable) < max(2, len(rows) // 2):
        return {"verdict": "inconclusive", "because": "Most environments hit infrastructure failures. Rerun before drawing conclusions."}
    hit = [r for r in usable if r["failed"] > 0]
    if not hit:
        return {"verdict": "not_reproduced", "because": f"0 failures across {len(usable)} environments. Ask support for the customer's exact browser, extensions and network."}

    clean_cloud_hit = [r for r in hit if r["provider"] == "browserbase" and not r.get("customised")]
    faults_hit = {r["fault"] for r in hit}

    # An environment with ad blocking, an extension or a persisted profile differs from the
    # baseline in more than its engine, so it cannot settle an engine question either way.
    plain = [r for r in usable if not r.get("customised")]
    plain_hit = [r for r in plain if r["failed"] > 0]
    if not plain_hit:
        customised_hit = sorted({r["env"] for r in hit})
        return {"verdict": "environment_specific",
                "because": f"Only failed where the environment was customised ({', '.join(customised_hit)}). "
                           "An otherwise identical browser did not fail, so this is the customer's setup, not the engine."}

    engines_all = {r["engine"] for r in plain}
    engines_hit = {r["engine"] for r in plain_hit}
    # compare like with like: within the same network condition, which engines failed?
    same_fault = [r for r in plain if r["fault"] in faults_hit]
    engines_clean_under_same_fault = {r["engine"] for r in same_fault if r["failed"] == 0} - engines_hit

    if engines_clean_under_same_fault and len(engines_all) > 1:
        return {"verdict": "browser_specific",
                "because": f"Fails on {', '.join(sorted(engines_hit))} but not on {', '.join(sorted(engines_clean_under_same_fault))} under the same conditions."}
    if clean_cloud_hit and "none" not in faults_hit:
        return {"verdict": "website_defect_network_trigger",
                "because": f"Fails in a clean cloud browser and on every engine tested ({', '.join(sorted(engines_hit))}), only when the network misbehaves ({', '.join(sorted(faults_hit))}). Not the customer's browser."}
    if clean_cloud_hit:
        return {"verdict": "website_defect",
                "because": "Fails in a clean cloud browser with no extensions, cache or customer state. Not the customer's browser."}

    # Everything below rests on a clean cloud browser having PASSED. If none of them
    # produced a usable run -- no key, no minutes, every session lost to infrastructure --
    # then saying "a clean cloud browser did not fail" would be inventing a negative control.
    if not [r for r in usable if r["provider"] == "browserbase" and not r.get("customised")]:
        return {"verdict": "inconclusive",
                "because": f"Failed in {', '.join(r['env'] for r in hit)}, but no clean cloud browser produced a usable run, "
                           "so the customer's own environment cannot be ruled out. Rerun with Browserbase reachable."}

    return {"verdict": "browser_specific",
            "because": f"Only failed in: {', '.join(r['env'] for r in hit)}. A clean cloud browser did not fail."}


# ----------------------------------------------------------------------------- the lab
class BrowserLab:
    def __init__(self, bus, agent="qa-engineer"):
        self.bus = bus
        self.agent = agent                     # qa-engineer or release-verifier; the console refuses anyone else
        self._bb = None

    @property
    def bb(self):
        if self._bb is None:
            from browserbase import Browserbase
            self._bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
        return self._bb

    def run_matrix(self, experiment_id: str, target: str, steps: Callable, observe: Callable,
                   envs=None, runs: int = 3, reset: Optional[Callable] = None):
        """
        steps(page, target)   the reproduction steps, written once, run everywhere
        observe() -> bool     True if the FAILURE happened. Check the system of record (DB / API),
                              not the UI: two confirmation toasts are not two reservations.
        reset()               put the sandbox back to a known state before every run
        Returns {"matrix": [...], "attribution": {...}} ready to merge into the EXP ledger record.
        """
        envs = envs or default_matrix()
        rows = []
        with sync_playwright() as pw:
            for env in envs:
                row = {"env": env.name, "provider": env.provider, "engine": env.engine if env.provider == "local" else "chromium",
                       "fault": env.fault.replace("_", " "), "runs": runs, "failed": 0, "infra": 0,
                       "customised": bool(env.block_ads or env.extension_id or env.context_id)}
                for n in range(1, runs + 1):
                    outcome = self._one_run(pw, env, experiment_id, n, target, steps, observe, reset)
                    if outcome == "failed": row["failed"] += 1
                    if outcome == "infra": row["infra"] += 1
                rows.append(row)
        verdict = attribute(rows)
        for r in rows: r.pop("customised", None)
        return {"matrix": rows, "attribution": verdict}

    # -- one run in one environment ------------------------------------------------------------
    def _one_run(self, pw, env, experiment_id, n, target, steps, observe, reset):
        session_id, live_url, replay_url, browser = f"local-{uuid.uuid4().hex[:10]}", None, None, None
        common = dict(env=env.name, env_detail=env.detail(), experiment=experiment_id, run=n, target=target, provider=env.provider)
        try:
            if reset: reset()
            if env.provider == "browserbase":
                session = self.bb.sessions.create(**self._bb_params(env, experiment_id))
                session_id = session.id
                replay_url = f"https://www.browserbase.com/sessions/{session.id}"
                try:
                    live_url = self.bb.sessions.debug(session.id).debugger_fullscreen_url
                except Exception:
                    live_url = None  # the run still counts; you just cannot watch it live
                browser = pw.chromium.connect_over_cdp(session.connect_url)
                context = browser.contexts[0]
                page = context.pages[0] if context.pages else context.new_page()
            else:
                browser = getattr(pw, env.engine).launch()
                opts = dict(pw.devices[env.device]) if env.device else {}
                if env.viewport: opts["viewport"] = env.viewport
                context = browser.new_context(**opts)
                page = context.new_page()

            self.bus.browser(self.agent, session_id, "open", live_url=live_url, replay_url=replay_url, **common)
            self._install_fault(page, env)
            steps(page, target)
            failed = bool(observe())
            self.bus.browser(self.agent, session_id, "closed", replay_url=replay_url,
                             outcome="Failure reproduced" if failed else "Behaved correctly", **common)
            return "failed" if failed else "ok"
        except Exception as e:  # crashed browser, dead session, flaky selector: infrastructure, never evidence
            self.bus.browser(self.agent, session_id, "failed", replay_url=replay_url,
                             outcome=f"Infrastructure failure: {type(e).__name__}: {str(e)[:120]}", **common)
            return "infra"
        finally:
            try:
                if browser: browser.close()  # closing the CDP connection ends a Browserbase session (keep_alive is off)
            except Exception:
                pass

    def _bb_params(self, env, experiment_id):
        settings = {"blockAds": env.block_ads, "recordSession": True, "logSession": True}
        if env.viewport: settings["viewport"] = env.viewport
        if env.extension_id: settings["extensionId"] = env.extension_id
        if env.context_id: settings["context"] = {"id": env.context_id, "persist": False}
        # api_timeout is the session lifetime in seconds. The SDK's plain `timeout` is the
        # HTTP client timeout, so passing it there silently leaves the session on the project default.
        project_id = os.environ.get("BROWSERBASE_PROJECT_ID")
        if not project_id:
            raise RuntimeError("BROWSERBASE_PROJECT_ID is not set; the Browserbase API requires a project id.")
        params = {"browser_settings": settings, "api_timeout": 300, "project_id": project_id}
        if env.region: params["region"] = env.region
        if env.proxy_country:
            params["proxies"] = [{"type": "browserbase", "geolocation": {"country": env.proxy_country}}]
        return params

    @staticmethod
    def _install_fault(page, env):
        if env.fault == "none":
            return
        left = {"n": env.fault_times}

        def handler(route):
            if left["n"] <= 0:
                return route.continue_()
            left["n"] -= 1
            if env.fault == "drop_response":
                route.fetch()                       # the SERVER receives and processes the request...
                return route.abort("connectionreset")  # ...but the browser never hears back
            if env.fault == "slow_response":
                response = route.fetch()
                page.wait_for_timeout(8000)
                return route.fulfill(response=response)
            return route.continue_()

        page.route(env.fault_url, handler)
