import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const children = [
  spawn(process.execPath, [nextBin, mode], { cwd: root, env: process.env, stdio: "inherit" }),
  spawn(process.execPath, [path.join(root, "worker", "live", "server.mjs")], { cwd: root, env: process.env, stdio: "inherit" }),
];
let stopping = false;

function stop(signal = "SIGTERM", exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill(signal);
  setTimeout(() => { process.exit(exitCode); }, 250).unref();
}

for (const child of children) child.once("error", (error) => {
  console.error(`[patch-live] could not start a process: ${error.message}`);
  stop("SIGTERM", 1);
});
for (const child of children) child.once("exit", (code, signal) => {
  if (!stopping) stop("SIGTERM", code || (signal ? 1 : 0));
});
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
