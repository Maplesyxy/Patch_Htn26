import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(project, ".static-demo-build");
const output = path.join(project, "static-demo-out");

// Build from this small allowlist so server routes, middleware, workers, local
// configuration, and environment files cannot enter the public artifact.
rmSync(stage, { recursive: true, force: true });
rmSync(output, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const name of ["app", "components", "lib", "public"]) {
  cpSync(path.join(project, name), path.join(stage, name), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(project, source).split(path.sep).join("/");
      return !relative.startsWith("app/api/") && relative !== "app/api"
        && !relative.startsWith("app/login/") && relative !== "app/login";
    },
  });
}
for (const name of ["next.config.mjs", "jsconfig.json", "package.json"]) {
  cpSync(path.join(project, name), path.join(stage, name));
}
symlinkSync(path.join(project, "node_modules"), path.join(stage, "node_modules"), "dir");

const nextBin = path.join(project, "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: stage,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_DEMO_ONLY: "1" },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const exported = path.join(stage, "out");
if (!existsSync(path.join(exported, "index.html")) || !existsSync(path.join(exported, "runs", "demo", "index.html"))) {
  throw new Error("Static export is missing the homepage or /runs/demo/ page.");
}
cpSync(exported, output, { recursive: true });
console.log(`Static demo built at ${output}`);
