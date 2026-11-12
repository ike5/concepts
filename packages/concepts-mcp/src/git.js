import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export async function git(cwd, args, { allowFail = false } = {}) {
  try {
    const { stdout } = await execFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (allowFail) return null;
    const detail = (error.stderr || error.message || "").toString().trim().split("\n")[0];
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

export async function repoRoot(path) {
  const out = await git(path, ["rev-parse", "--show-toplevel"], { allowFail: true });
  if (!out) throw new Error(`${path} is not inside a git repository.`);
  return out.trim();
}

export async function headSha(root) {
  const out = await git(root, ["rev-parse", "--verify", "-q", "HEAD"], { allowFail: true });
  return out ? out.trim() : null;
}

export async function isAncestor(root, sha) {
  return (await git(root, ["merge-base", "--is-ancestor", sha, "HEAD"], { allowFail: true })) !== null;
}

export async function gitPath(root, name) {
  return (await git(root, ["rev-parse", "--path-format=absolute", "--git-path", name])).trim();
}

/** A stable, filesystem-safe name for the repo: owner-repo from the origin remote, else the folder name. */
export async function repoName(root) {
  const remote = (await git(root, ["remote", "get-url", "origin"], { allowFail: true }))?.trim();
  const match = remote?.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  const raw = match ? `${match[1]}-${match[2]}` : root.split(/[\\/]/).filter(Boolean).pop() || "repo";
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "") || "repo";
}

/** Commits after `baseline` (exclusive) up to HEAD, oldest first, merges excluded. */
export async function commitsSince(root, baseline, cap = 200) {
  const range = baseline ? `${baseline}..HEAD` : "HEAD";
  // Without a baseline (it was rebased away, or the repo had no commits at setup) look back a little, not at all history.
  const count = baseline ? cap : Math.min(cap, 10);
  const out = await git(root, ["rev-list", "--no-merges", `--max-count=${count}`, range], { allowFail: true });
  return out ? out.trim().split("\n").filter(Boolean).reverse() : [];
}

export async function commitMeta(root, sha) {
  const sep = "\u001f";
  const out = await git(root, ["show", "-s", `--format=%H${sep}%h${sep}%an${sep}%aI${sep}%s${sep}%b`, sha]);
  const [full, short, author, date, subject, ...body] = out.split(sep);
  return { sha: full, shortSha: short, author, date, subject, body: body.join(sep).trim() };
}

/**
 * A commit's place in history: how many commits it builds on, itself included. A commit always numbers
 * higher than every commit before it, whatever the clocks said, so same-day commits sort correctly.
 */
export async function commitSeq(root, sha) {
  const out = await git(root, ["rev-list", "--count", sha], { allowFail: true });
  const n = Number(out?.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function changedFiles(root, sha) {
  const out = await git(root, ["show", "--format=", "--numstat", "-M", "--no-color", sha]);
  return out.trim().split("\n").filter(Boolean).map((line) => {
    const [added, removed, ...rest] = line.split("\t");
    const path = rest.join("\t").replace(/^(.*)\{(.*) => (.*)\}(.*)$/, "$1$3$4").replace(/^.* => /, "");
    return { path, added: added === "-" ? null : Number(added), removed: removed === "-" ? null : Number(removed) };
  });
}

const NOISE = [
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "Cargo.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "Gemfile.lock", "composer.lock", "go.sum", "Package.resolved",
  "*.min.js", "*.min.css", "*.map", "*.snap", "*.svg", "*.excalidraw",
];

export function isNoise(path) {
  const name = path.split("/").pop();
  return NOISE.some((p) => (p.startsWith("*") ? name.endsWith(p.slice(1)) : name === p));
}

/**
 * The commit's patch with lockfiles, generated files and `excludeDirs` removed, trimmed so each file
 * gets a fair share of `maxChars`. Returns the text plus which files were trimmed or omitted.
 */
export async function commitDiff(root, sha, { maxChars = 24000, excludeDirs = [] } = {}) {
  const raw = await git(root, ["show", "--format=", "--patch", "-M", "--no-color", "--unified=3", sha]);
  const chunks = raw.split(/^(?=diff --git )/m).filter((c) => c.startsWith("diff --git"));
  const kept = [];
  const omitted = [];
  for (const chunk of chunks) {
    const path = chunk.match(/^diff --git a\/.* b\/(.*)$/m)?.[1] ?? "";
    const excluded = excludeDirs.some((dir) => dir && (path === dir || path.startsWith(`${dir}/`)));
    if (excluded || isNoise(path) || /^Binary files /m.test(chunk)) omitted.push(path);
    else kept.push({ path, text: chunk });
  }
  const share = kept.length ? Math.max(1500, Math.floor(maxChars / kept.length)) : maxChars;
  const truncated = [];
  let total = 0;
  const parts = [];
  for (const { path, text } of kept) {
    let piece = text.length > share ? `${text.slice(0, share)}\n… [${text.length - share} more characters of ${path} trimmed]\n` : text;
    if (piece !== text) truncated.push(path);
    if (total + piece.length > maxChars) {
      omitted.push(path);
      continue;
    }
    total += piece.length;
    parts.push(piece);
  }
  return { diff: parts.join(""), truncated, omitted };
}
