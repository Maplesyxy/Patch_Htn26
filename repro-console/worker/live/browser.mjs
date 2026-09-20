import fs from "node:fs/promises";
import path from "node:path";

const SAFE_NAVIGATION_URL = /^(https?:)$/;
const MAX_TELEMETRY = 120;

export class BrowserProviderError extends Error {
  constructor(message, { kind = "configuration", cause } = {}) {
    super(message, { cause });
    this.name = "BrowserProviderError";
    this.kind = kind;
  }
}

export function safeUrl(input, origin) {
  try {
    const u = new URL(input);
    if (!SAFE_NAVIGATION_URL.test(u.protocol) || (origin && u.origin !== origin)) return undefined;
    // Queries and fragments may contain account identifiers or secrets.
    return `${u.origin}${u.pathname}`.slice(0, 320);
  } catch { return undefined; }
}

export class BrowserSession {
  constructor({ browser, context, page, provider, sessionId, liveUrl, targetUrl, report, config, signal }) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.provider = provider;
    this.sessionId = sessionId;
    this.liveUrl = liveUrl;
    this.targetUrl = targetUrl;
    this.report = report || "";
    this.origin = new URL(targetUrl).origin;
    this.config = config;
    this.signal = signal;
    this.observedUrls = new Map();
    this.telemetry = [];
    this.navigationBlocks = 0;
    this.networkFault = null;
    this.release = null;
    this.nextTarget = 1;
  }

  async installGuards() {
    await this.context.route("**/*", async (route) => {
      const req = route.request();
      const reqUrl = req.url();
      const resourceType = req.resourceType();
      let parsed;
      try { parsed = new URL(reqUrl); } catch { await route.abort("blockedbyclient"); return; }
      if (resourceType === "document" && parsed.origin !== this.origin) {
        this.navigationBlocks += 1;
        this.record("navigation_blocked", `${req.method()} ${safeUrl(reqUrl)} attempted a cross-origin navigation.`);
        await route.abort("blockedbyclient");
        return;
      }
      const canInject = this.networkFault && !this.networkFault.used &&
        req.method().toUpperCase() === "POST" && parsed.origin === this.origin &&
        parsed.pathname === this.networkFault.pathname;
      if (canInject) {
        this.networkFault.used = true;
        try {
          // Deliver the request upstream first: this models a lost response after
          // the server has had a chance to process it.
          const upstream = await route.fetch({ timeout: this.config.limits.actionMs, maxRedirects: 0, maxRetries: 0 });
          this.networkFault.upstreamStatus = upstream.status();
          await route.abort("connectionreset");
          this.networkFault.applied = true;
          this.record("response_dropped", `Upstream returned ${upstream.status()} for POST ${parsed.pathname}; the browser response was cut.`);
        } catch (error) {
          this.record("response_drop_error", `Could not complete the upstream request before cutting the response: ${shortError(error)}`);
          try { await route.abort("connectionreset"); } catch {}
        }
        return;
      }
      await route.continue();
    });
    if (this.signal) this.signal.addEventListener("abort", () => { void this.context.close().catch(() => {}); }, { once: true });
    this.context.on("page", (popup) => {
      if (popup !== this.page) void popup.close().catch(() => {});
    });
    this.page.on("request", (req) => {
      const clean = safeUrl(req.url(), this.origin);
      if (!clean) return;
      const id = this.targetId(clean);
      this.record("request", `${req.method().toUpperCase()} ${clean}`);
      this.observedUrls.set(id, { id, url: clean, pathname: new URL(clean).pathname, method: req.method().toUpperCase() });
    });
    this.page.on("response", (res) => {
      const clean = safeUrl(res.url(), this.origin);
      if (clean) this.record("response", `${res.request().method().toUpperCase()} ${res.status()} ${clean}`);
    });
    this.page.on("requestfailed", (req) => {
      const clean = safeUrl(req.url(), this.origin);
      if (clean) this.record("request_failed", `${req.method().toUpperCase()} ${clean}: ${shortError(req.failure()?.errorText || "request failed")}`);
    });
    this.page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) this.record(`console_${message.type()}`, redact(message.text()));
    });
    this.page.on("pageerror", (error) => this.record("page_error", redact(shortError(error))));
    this.page.on("framenavigated", (frame) => {
      if (frame !== this.page.mainFrame()) return;
      const clean = safeUrl(frame.url(), this.origin);
      if (!clean) this.record("cross_origin_frame_navigation", "A frame attempted to navigate outside the target origin.");
    });
  }

  record(kind, detail) {
    this.telemetry.push({ at: new Date().toISOString(), kind, detail: redact(String(detail)).slice(0, 700) });
    if (this.telemetry.length > MAX_TELEMETRY) this.telemetry.splice(0, this.telemetry.length - MAX_TELEMETRY);
  }

  targetId(url) {
    const existing = [...this.observedUrls.values()].find((entry) => entry.url === url);
    if (existing) return existing.id;
    return `N${this.nextTarget++}`;
  }

  observedNetwork() {
    return [...this.observedUrls.values()].slice(-24).map(({ id, url, method }) => ({ id, url, method }));
  }

  async snapshot() {
    const state = await this.page.evaluate(() => {
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity || 1) > 0;
      };
      const cleanText = (s, n = 220) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
      const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]';
      const elements = [...document.querySelectorAll(selector)].map((el, domIndex) => ({ el, domIndex })).filter(({ el }) => visible(el)).slice(0, 80).map(({ el, domIndex }, index) => {
        const id = `E${index + 1}`;
        const tag = el.tagName.toLowerCase();
        const labels = el.labels ? [...el.labels].map((x) => x.innerText).join(" ") : "";
        const type = tag === "input" ? el.getAttribute("type") || "text" : undefined;
        const placeholder = cleanText(el.getAttribute("placeholder"), 80);
        const accessibleName = el.getAttribute("aria-label") || el.getAttribute("title") || labels || el.innerText || placeholder || el.getAttribute("alt");
        const text = cleanText(accessibleName);
        const sensitive = /password|email|e-mail|tel|phone|credit|card|cvv|cvc|token|secret|auth/i.test(`${type || ""} ${el.getAttribute("name") || ""} ${el.id || ""} ${accessibleName || ""}`);
        const options = tag === "select" ? [...el.options].slice(0, 30).map((option) => cleanText(option.label || option.textContent, 80)) : undefined;
        const selectedOption = tag === "select" ? cleanText(el.selectedOptions?.[0]?.label || el.selectedOptions?.[0]?.textContent, 120) : undefined;
        const value = !sensitive && "value" in el && tag !== "select" ? cleanText(el.value, 140) : undefined;
        const checked = /^(checkbox|radio)$/.test(type || "") ? Boolean(el.checked) : undefined;
        return { id, domIndex, tag, role: el.getAttribute("role") || undefined, type, name: text || tag, disabled: Boolean(el.disabled), placeholder: placeholder || undefined, value, checked, selectedOption: sensitive ? undefined : selectedOption, options: sensitive ? undefined : options };
      });
      const body = cleanText(document.body?.innerText || "", 9000);
      return { title: cleanText(document.title, 180), body, elements, selector, viewport: { width: innerWidth, height: innerHeight }, href: location.href };
    });
    const elements = this.page.locator(state.selector);
    const handles = new Map();
    for (const item of state.elements) {
      try {
        const handle = await elements.nth(item.domIndex).elementHandle();
        if (handle && await handle.evaluate((el) => el.isConnected)) handles.set(item.id, handle);
      } catch { /* A detached element is left unavailable for the next action. */ }
    }
    state.body = redact(state.body);
    state.title = redact(state.title);
    state.url = safeUrl(state.href, this.origin);
    delete state.href;
    delete state.selector;
    state.elements = state.elements.map(({ domIndex, ...item }) => ({ ...item, name: redact(item.name), placeholder: item.placeholder ? redact(item.placeholder) : undefined, value: item.value ? redact(item.value) : undefined, selectedOption: item.selectedOption ? redact(item.selectedOption) : undefined, options: item.options?.map(redact) }));
    return { state, handles };
  }

  async act(action, handles) {
    if (this.signal?.aborted) throw abortError();
    if (action.action === "wait") {
      await this.page.waitForTimeout(Math.max(0, Math.min(5000, Number(action.milliseconds) || 500)));
      return "Waited for the page to settle.";
    }
    if (action.action === "network_fault") {
      if (action.mode === "none") { this.networkFault = null; return "No network fault was configured."; }
      if (!/drop(?:s|ped|ping)?\s+(?:the\s+)?response|lost response|response loss|connection reset|retry|timed?\s*out/i.test(this.report)) {
        throw new Error("Response loss was not described in the customer report, so no fault was injected.");
      }
      const endpoint = this.observedUrls.get(action.networkRequestId);
      if (!endpoint || new URL(endpoint.url).origin !== this.origin || !endpoint.pathname || endpoint.pathname === "/") {
        throw new Error("Network fault needs a same-origin request path observed on this page.");
      }
      if (endpoint.method !== "POST") throw new Error("Network fault source must be an observed same-origin POST request.");
      if (!this.networkFault) this.networkFault = { pathname: endpoint.pathname, requestId: endpoint.id, used: false, applied: false };
      if (this.networkFault.pathname !== endpoint.pathname) throw new Error("Only one observed request path can be faulted in this experiment.");
      return `Configured a one-time response drop for the first POST to observed same-origin path ${endpoint.pathname}.`;
    }
    if (action.action === "finish") return "Finished.";
    const locator = handles.get(action.targetId);
    if (!locator) throw new Error("The requested element is not in the latest browser observation.");
    const target = await locator.evaluate((el) => ({ connected: el.isConnected, tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || "", disabled: Boolean(el.disabled) }));
    if (!target.connected) throw new Error("The element changed after observation. Take a fresh observation before acting.");
    if (target.disabled) throw new Error("That control is disabled.");
    if (action.action === "click") {
      await locator.click({ timeout: this.config.limits.actionMs });
      return `Clicked ${action.targetId}.`;
    }
    if (action.action === "fill") {
      const value = String(action.value || "").slice(0, 240);
      if (/(password|email|tel|credit|card|token|secret)/i.test(`${target.type} ${action.fieldType || ""}`)) throw new Error("Sensitive fields cannot be filled by the investigation agent.");
      await locator.fill(value, { timeout: this.config.limits.actionMs });
      return `Filled ${action.targetId} using a value supplied in the report.`;
    }
    if (action.action === "select") {
      if (target.tag !== "select") throw new Error("Select actions require a visible select control.");
      await locator.selectOption({ label: String(action.value || "").slice(0, 120) }, { timeout: this.config.limits.actionMs });
      return `Selected an option on ${action.targetId}.`;
    }
    if (action.action === "press") {
      const key = ["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Space"].includes(action.key) ? action.key : "Enter";
      await locator.press(key, { timeout: this.config.limits.actionMs });
      return `Pressed ${key} on ${action.targetId}.`;
    }
    if (action.action === "scroll") {
      const direction = action.direction === "up" ? -1 : 1;
      await locator.evaluate((el, dir) => el.scrollBy({ top: dir * Math.max(160, Math.min(700, Math.round(window.innerHeight * 0.65))), behavior: "instant" }), direction);
      return `Scrolled ${action.targetId} ${direction < 0 ? "up" : "down"}.`;
    }
    throw new Error(`Unsupported action "${action.action}".`);
  }

  async screenshot(runId, frame) {
    const dir = path.join(this.config.dataDir, runId);
    await fs.mkdir(dir, { recursive: true });
    let name = `frame-${String(frame).padStart(4, "0")}.jpg`;
    let file = path.join(dir, name);
    const bytes = await this.page.screenshot({ type: "jpeg", quality: 72, fullPage: false, timeout: this.config.limits.actionMs });
    let handle;
    try { handle = await fs.open(file, "wx"); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      name = `frame-${String(frame).padStart(4, "0")}-${Date.now()}.jpg`;
      file = path.join(dir, name);
      handle = await fs.open(file, "wx");
    }
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
    return `/api/runs/${encodeURIComponent(runId)}/artifacts/${name}`;
  }

  async close() {
    try { await this.context.close(); } catch {}
    try { await this.browser.close(); } catch {}
    if (this.release) try { await this.release(); } catch {}
  }
}

export async function openBrowserSession(config, provider, targetUrl, signal, report = "") {
  const { chromium } = await import("playwright");
  let browser;
  let sessionId = `local-${Date.now()}`;
  let liveUrl;
  let release;
  try {
    if (provider === "browserbase") {
      const response = await fetch(`${config.browserbase.apiUrl}/sessions`, {
        method: "POST",
        headers: { "X-BB-API-Key": config.browserbase.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: config.browserbase.projectId, browserSettings: { viewport: { width: 1365, height: 900 }, recordSession: true, logSession: true }, timeout: 600 }),
        signal,
      });
      const session = await readJson(response);
      if (!response.ok) throw new BrowserProviderError("Could not create a Browserbase session. Check project and API key settings.", { kind: "provider" });
      sessionId = String(session.id || session.sessionId || "");
      const connectUrl = session.connectUrl || session.connect_url || session.wsEndpoint;
      if (!sessionId) throw new BrowserProviderError("Browserbase returned an incomplete session response.", { kind: "provider" });
      release = async () => {
        const r = await fetch(`${config.browserbase.apiUrl}/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PUT", headers: { "X-BB-API-Key": config.browserbase.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: config.browserbase.projectId, status: "REQUEST_RELEASE" }), signal: AbortSignal.timeout(10000),
        });
        if (!r.ok && r.status !== 404) throw new Error(`Browserbase session release returned ${r.status}.`);
      };
      if (!connectUrl) throw new BrowserProviderError("Browserbase did not return a CDP connection URL.", { kind: "provider" });
      browser = await chromium.connectOverCDP(connectUrl, { timeout: 30000 });
      try {
        const debugResponse = await fetch(`${config.browserbase.apiUrl}/sessions/${encodeURIComponent(sessionId)}/debug`, { headers: { "X-BB-API-Key": config.browserbase.apiKey }, signal });
        const debug = await readJson(debugResponse);
        if (debugResponse.ok) liveUrl = debug.debuggerFullscreenUrl || debug.debuggerUrl;
      } catch {
        // A missing debug URL limits the embedded live view; screenshots still work.
      }
    } else if (provider === "local") {
      const options = { headless: true, timeout: 30000 };
      if (config.local.executablePath) options.executablePath = config.local.executablePath;
      browser = await chromium.launch(options);
    } else {
      throw new BrowserProviderError("Choose Browserbase or local Chromium.");
    }
    const context = provider === "browserbase" ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1365, height: 900 } });
    if (!context) throw new BrowserProviderError("The browser provider returned no isolated browser context.", { kind: "provider" });
    const page = provider === "browserbase" ? context.pages()[0] || await context.newPage() : await context.newPage();
    page.setDefaultTimeout(config.limits.actionMs);
    page.setDefaultNavigationTimeout(config.limits.actionMs);
    const opened = new BrowserSession({ browser, context, page, provider, sessionId, liveUrl, targetUrl, report, config, signal });
    opened.release = release;
    await opened.installGuards();
    return opened;
  } catch (error) {
    try { await browser.close(); } catch {}
    if (release) try { await release(); } catch {}
    throw error;
  }
}

export function validateNetworkFaultRequest(session, action, report) {
  if (action.mode !== "drop_response") return action.mode === "none";
  if (!/drop(?:s|ped|ping)?\s+(?:the\s+)?response|lost response|response loss|connection reset|retry|timed?\s*out/i.test(report)) return false;
  return session.observedUrls.get(action.networkRequestId)?.method === "POST";
}

function redact(input) {
  const protectedDates = [];
  let text = String(input || "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, (value) => {
    const key = `__PATCHDATE${protectedDates.length}__`;
    protectedDates.push(value);
    return key;
  });
  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, "[redacted number]")
    .replace(/(?:bearer\s+)[A-Z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password|api[-_]?key)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[redacted]");
  for (let i = 0; i < protectedDates.length; i += 1) text = text.replace(`__PATCHDATE${i}__`, protectedDates[i]);
  return text.slice(0, 1200);
}

function shortError(error) { return String(error?.message || error || "Unknown browser error").replace(/https?:\/\/[^\s)]+/g, "[url]").slice(0, 240); }

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function abortError() {
  const error = new Error("Run stopped.");
  error.name = "AbortError";
  return error;
}
