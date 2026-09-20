import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadRuntimeConfig(env = process.env, { loadDotenv = true } = {}) {
  if (loadDotenv) {
    const { loadEnvConfig } = require("@next/env");
    loadEnvConfig(root);
  }
  const pairs = String(env.REPRO_INGEST_TOKENS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const parsedPairs = pairs.map((item) => {
    const separator = item.indexOf(":");
    return separator > 0 ? { workspace: item.slice(0, separator), token: item.slice(separator + 1) } : null;
  }).filter(Boolean);
  const explicitToken = env.REPRO_INGEST_TOKEN || "";
  const matchedPair = explicitToken ? parsedPairs.find((pair) => pair.token === explicitToken) : null;
  const selectedPair = matchedPair || parsedPairs[0] || null;
  const ingestToken = explicitToken || selectedPair?.token || "";
  const runtimeWorkspace = env.PATCH_RUNTIME_WORKSPACE || "";
  let workspaceError = "";
  let workspace = selectedPair?.workspace || runtimeWorkspace || "";
  if (runtimeWorkspace && selectedPair && runtimeWorkspace !== selectedPair.workspace) {
    workspaceError = "PATCH_RUNTIME_WORKSPACE must match the selected ingest token workspace.";
  } else if (explicitToken && parsedPairs.length && !matchedPair) {
    workspaceError = "REPRO_INGEST_TOKEN does not match a configured workspace token.";
  } else if (explicitToken && !matchedPair && !runtimeWorkspace) {
    workspaceError = "Set PATCH_RUNTIME_WORKSPACE alongside an explicit REPRO_INGEST_TOKEN when no workspace mapping is present.";
  }
  if (!workspace) workspace = "default";
  const consoleUrl = String(env.REPRO_CONSOLE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const browserbaseConfigured = Boolean(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID);
  const executionModel = env.PATCH_EXECUTION_MODEL || "opus";
  const supervisorModel = env.PATCH_SUPERVISOR_MODEL || "gemini-3.6-flash";
  const incidentsModel = env.PATCH_INCIDENTS_MODEL || "gemini-3.6-flash";
  const claudeCommand = env.PATCH_CLAUDE_COMMAND || "claude";
  const localConfigured = await hasPlaywrightChromium(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "");
  const missing = [];
  if (!env.PATCH_RUNTIME_TOKEN) missing.push("PATCH_RUNTIME_TOKEN");
  if (!ingestToken) missing.push("REPRO_INGEST_TOKEN or REPRO_INGEST_TOKENS");
  if (workspaceError) missing.push(workspaceError);
  if (!env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!browserbaseConfigured && !localConfigured) missing.push("BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID or Playwright Chromium");
  if (!await commandExists(claudeCommand)) missing.push("Claude Code CLI (claude)");

  return {
    root,
    host: env.PATCH_RUNTIME_HOST || "127.0.0.1",
    port: Number(env.PATCH_RUNTIME_PORT || 4318),
    token: env.PATCH_RUNTIME_TOKEN || "",
    consoleUrl,
    ingestToken,
    workspace,
    repoConfigured: env.PATCH_FIX_BOOKING_APP === "1" && Boolean(env.PATCH_FIX_REPO_PATH),
    browserbase: {
      configured: browserbaseConfigured,
      apiKey: env.BROWSERBASE_API_KEY || "",
      projectId: env.BROWSERBASE_PROJECT_ID || "",
      apiUrl: env.BROWSERBASE_API_URL || "https://api.browserbase.com/v1",
      connectUrl: env.BROWSERBASE_CONNECT_URL || "wss://connect.browserbase.com",
    },
    local: { configured: localConfigured, executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "" },
    models: { execution: executionModel, supervisor: supervisorModel, incidents: incidentsModel },
    claudeCommand,
    geminiApiKey: env.GEMINI_API_KEY || "",
    dataDir: path.resolve(env.PATCH_RUNTIME_DATA_DIR || path.join(root, ".patch-runs")),
    limits: { actions: 16, runMs: 10 * 60 * 1000, actionMs: 35 * 1000, queued: 5 },
    missing,
  };
}

export function validateTargetUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error("Enter a valid website URL."); }
  if (!(url.protocol === "http:" || url.protocol === "https:")) throw new Error("Only http and https website URLs are supported.");
  if (url.username || url.password) throw new Error("Website URLs cannot contain a username or password.");
  if (url.href.length > 2048) throw new Error("Website URL is too long.");
  return url;
}

async function hasPlaywrightChromium(customExecutablePath) {
  try {
    const { chromium } = await import("playwright");
    const executable = customExecutablePath || chromium.executablePath();
    await fs.access(executable);
    return true;
  } catch { return false; }
}

async function commandExists(command) {
  if (command.includes(path.sep)) {
    try { await (await import("node:fs/promises")).access(command); return true; } catch { return false; }
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try { await promisify(execFile)("which", [command], { timeout: 1000 }); return true; } catch { return false; }
}

export function configForTest(overrides = {}) {
  return {
    root,
    host: "127.0.0.1",
    port: 4318,
    token: "test-runtime-token",
    consoleUrl: "http://127.0.0.1:3000",
    ingestToken: "test-ingest-token",
    workspace: "test",
    repoConfigured: false,
    browserbase: { configured: false, apiKey: "", projectId: "", apiUrl: "https://api.browserbase.com/v1", connectUrl: "wss://connect.browserbase.com" },
    local: { configured: true, executablePath: "" },
    models: { execution: "opus", supervisor: "gemini-3.6-flash", incidents: "gemini-3.6-flash" },
    claudeCommand: "claude",
    geminiApiKey: "test-key",
    dataDir: path.join(root, ".patch-runs-test"),
    limits: { actions: 16, runMs: 600000, actionMs: 35000, queued: 5 },
    missing: [],
    ...overrides,
  };
}
