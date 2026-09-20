// Parse a unified git diff into something renderable.
//
// Deliberately small: it handles what `git diff --no-ext-diff --binary HEAD` emits
// for the source-fix adapter, and degrades to a plain file entry for anything it
// does not recognise rather than throwing in front of a reviewer.

const FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  const pushFile = () => { if (file) files.push(file); };

  for (const raw of String(text || "").split("\n")) {
    const m = FILE_RE.exec(raw);
    if (m) {
      pushFile();
      file = { path: m[2], oldPath: m[1], hunks: [], added: 0, removed: 0, binary: false, status: "modified" };
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (raw.startsWith("new file mode")) { file.status = "added"; continue; }
    if (raw.startsWith("deleted file mode")) { file.status = "deleted"; continue; }
    if (raw.startsWith("rename from ") || raw.startsWith("rename to ")) { file.status = "renamed"; continue; }
    if (raw.startsWith("GIT binary patch") || raw.startsWith("Binary files ")) { file.binary = true; continue; }
    if (raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("similarity index")) continue;

    const h = HUNK_RE.exec(raw);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[3]);
      hunk = { header: raw, context: (h[5] || "").trim(), lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    // A genuine blank context line is " "; a bare "" is the trailing split artifact.
    if (raw === "") continue;

    const kind = raw[0];
    const body = raw.slice(1);
    if (kind === "+") {
      hunk.lines.push({ type: "add", text: body, old: null, new: newLine++ });
      file.added += 1;
    } else if (kind === "-") {
      hunk.lines.push({ type: "del", text: body, old: oldLine++, new: null });
      file.removed += 1;
    } else if (kind === "\\") {
      // "\ No newline at end of file"
      continue;
    } else {
      hunk.lines.push({ type: "ctx", text: body, old: oldLine++, new: newLine++ });
    }
  }
  pushFile();
  return files;
}

export function diffTotals(files) {
  return files.reduce(
    (acc, f) => ({ files: acc.files + 1, added: acc.added + f.added, removed: acc.removed + f.removed }),
    { files: 0, added: 0, removed: 0 }
  );
}

export const languageOf = (path) => {
  const ext = String(path).split(".").pop().toLowerCase();
  return { js: "javascript", jsx: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript",
           json: "json", css: "css", md: "markdown", py: "python" }[ext] || "text";
};
