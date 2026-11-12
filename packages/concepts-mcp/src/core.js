import { dirname, isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  CONFIG_FILE, LOCAL_CONFIG_FILE, OUTPUTS, contractHome, destinationPath, ensureDir, ignoreLocalConfig,
  normalizeDir, outputDirInRepo, readConfig, readLocalConfig, readSharedConfig, writeConfig, writeLocalConfig,
} from "./config.js";
import { changedFiles, commitDiff, commitMeta, commitSeq, commitsSince, git, headSha, isAncestor, repoName, repoRoot } from "./git.js";
import { readState, writeState } from "./state.js";
import { AGENTS, installCommands, installHook, writeAgentFiles } from "./agents.js";
import { commitFolder, commitLine, renderCommit, writeIndex, writeLibraryIndex, writeNote } from "./library.js";
import { checkRecord } from "./schema.js";
import { detailLabel, normalizeFiles, parseDetail } from "./choices.js";

export class NotConfiguredError extends Error {}

const DEFAULT_FILES = ["svg"];

async function resolveAll(root, destinations) {
  return Promise.all(destinations.map(async (d) => ({ ...d, path: await destinationPath(root, d) })));
}

async function load(repoPath) {
  const root = await repoRoot(resolve(repoPath || process.cwd()));
  const config = await readConfig(root);
  if (!config) {
    throw new NotConfiguredError(`concepts-mcp isn't set up in ${root}. Call setup_concepts with no choices: it shows the user a picker, or returns the questions to ask them with your multiple-choice tool.`);
  }
  const dests = await resolveAll(root, config.destinations);
  for (const d of dests) d.state = await readState(d.path);
  return { root, config, dests };
}

/** Commits that change nothing but concept output or setup files aren't worth a diagram. */
function onlySetupFiles(files, outRels) {
  const setup = new Set([CONFIG_FILE, LOCAL_CONFIG_FILE, "AGENTS.md", "CLAUDE.md"]);
  return files.length > 0 && files.every((f) => setup.has(f.path) || outRels.some((rel) => f.path === rel || f.path.startsWith(`${rel}/`)));
}

/** Fill in sequence numbers for commits recorded before they existed. A commit that's gone from history stays unnumbered. */
async function fillSeq(root, state) {
  const seqs = new Map();
  for (const [sha, c] of Object.entries(state.commits)) {
    if (!("seq" in c)) c.seq = await commitSeq(root, sha);
    seqs.set(sha, c.seq);
  }
  for (const concept of Object.values(state.concepts)) {
    for (const s of concept.sightings) if (!("seq" in s)) s.seq = seqs.get(s.sha) ?? (await commitSeq(root, s.sha));
  }
}

/**
 * A new folder starts with the processing history and concept library of an existing one, so nothing is
 * diagrammed twice and concept ids carry over. Its diagrams stay where they are: they're marked as living elsewhere.
 */
function seeded(root, source) {
  const where = outputDirInRepo(root, source.path) ?? contractHome(source.path);
  const commits = {};
  for (const [sha, c] of Object.entries(source.state.commits)) commits[sha] = c.folder && !c.elsewhere ? { ...c, elsewhere: where } : { ...c };
  const concepts = {};
  for (const [id, c] of Object.entries(source.state.concepts)) {
    concepts[id] = { ...c, sightings: c.sightings.map((s) => (s.elsewhere ? s : { ...s, elsewhere: where })) };
  }
  return { ...source.state, commits, concepts };
}

/**
 * Turn a requested destination into a stored one. Unset fields keep what the same kind of folder had
 * before, then fall back to defaults: docs/concepts or the learning library, at the Diagram level.
 */
function toDestination(d, previous, name) {
  if (!OUTPUTS.includes(d.output)) throw new Error('Each destination needs output "project" or "library".');
  const prev = previous.find((p) => p.output === d.output);
  const files = d.files?.length ? normalizeFiles(d.files) : d.detail ? parseDetail(d.detail) : prev?.files ?? DEFAULT_FILES;
  const out = { output: d.output, dir: normalizeDir(d.output, d.dir ?? prev?.dir), files };
  if (d.output === "library") out.repoName = prev?.repoName || name;
  return out;
}

/** What's set up now: the shared settings, the personal override, and which one applies. */
export async function currentSettings(repoPath) {
  const root = await repoRoot(resolve(repoPath || process.cwd()));
  const shared = await readSharedConfig(root);
  const local = await readLocalConfig(root);
  const destinations = local?.destinations ?? shared?.destinations ?? [];
  const resolved = await resolveAll(root, destinations).catch(() => destinations.map((d) => ({ ...d, path: d.dir })));
  return {
    root, configured: Boolean(shared), personal: Boolean(local),
    destinations: resolved.map((d) => ({ output: d.output, dir: d.dir, path: d.path, files: d.files, level: detailLabel(d.files) })),
  };
}

/**
 * Set up a repository, or change where and how much it saves. Pass `destinations` (one per folder), or the
 * single-folder shorthand `output`/`dir`/`detail`/`files`. `scope: "personal"` saves to the gitignored local
 * file instead of the shared config. Changing a folder leaves its old files where they are.
 */
export async function setup(repoPath, { destinations, output, dir, detail, files, scope = "shared", agents = AGENTS, gitHook = false, backfill = 0 } = {}) {
  const root = await repoRoot(resolve(repoPath || process.cwd()));
  const shared = await readSharedConfig(root).catch(() => null);
  const local = await readLocalConfig(root).catch(() => null);
  const before = local?.destinations ?? shared?.destinations ?? [];
  const name = await repoName(root);

  const asked = destinations?.length ? destinations : [{ output: output ?? "project", dir, detail, files }];
  const next = asked.map((d) => toDestination(d, before, name));
  const resolved = await resolveAll(root, next);
  const paths = resolved.map((d) => d.path);
  if (new Set(paths).size !== paths.length) throw new Error("Two destinations point at the same folder.");

  // Start after HEAD (or `backfill` commits before it), so setting up doesn't diagram the whole history.
  let baseline = shared?.baseline ?? "start";
  if (!shared && (await headSha(root))) {
    const back = Math.max(0, Math.min(50, backfill));
    const target = (await git(root, ["rev-parse", "--verify", "-q", `HEAD~${back}`], { allowFail: true }))?.trim();
    baseline = target || "start";
  }

  // Personal settings need a shared config to sit on top of, so the first setup is always shared.
  const personal = scope === "personal" && Boolean(shared);
  const changed = [];
  if (personal) {
    await writeLocalConfig(root, { destinations: next });
    changed.push(LOCAL_CONFIG_FILE);
    if (await ignoreLocalConfig(root)) changed.push(".gitignore");
  } else {
    await writeConfig(root, { baseline, destinations: next });
    changed.push(CONFIG_FILE);
  }
  changed.push(...(await writeAgentFiles(root, agents)));
  const hook = gitHook ? await installHook(root) : null;

  const previous = await resolveAll(root, before).catch(() => []);
  const sources = [];
  for (const d of [...previous, ...resolved]) {
    const state = await readState(d.path).catch(() => null);
    if (state && Object.keys(state.commits).length && !sources.some((s) => s.path === d.path)) sources.push({ ...d, state });
  }
  const seededFrom = [];
  for (const d of resolved) {
    await ensureDir(d.path);
    let state = await readState(d.path);
    if (!Object.keys(state.commits).length) {
      const source = sources.find((s) => s.path !== d.path && s.output === d.output) ?? sources.find((s) => s.path !== d.path);
      if (source) { state = seeded(root, source); seededFrom.push({ dir: d.path, from: source.path }); }
    }
    await fillSeq(root, state);
    await writeState(d.path, state);
    await writeIndex(d.path, state, d.repoName || name, { files: d.files });
    if (d.output === "library") await writeLibraryIndex(dirname(d.path));
  }
  const left = previous.filter((p) => !paths.includes(p.path) && existsSync(join(p.path, "state.json"))).map((p) => p.path);

  return {
    root,
    outputDir: resolved[0].path,
    outputDirs: resolved.map((d) => ({ output: d.output, dir: d.path, files: d.files, level: detailLabel(d.files) })),
    config: { version: 2, baseline, destinations: next },
    scope: personal ? "personal" : "shared",
    personalOverride: !personal && Boolean(local),
    seeded: seededFrom,
    left,
    changed, hook, install: installCommands(agents),
  };
}

export async function pending(repoPath, { limit = 3, maxDiffChars = 24000 } = {}) {
  const { root, config, dests } = await load(repoPath);
  // Commits that only change concept output are skipped. That covers this person's folders, the team's in-repo
  // folders when a personal override leaves them out, and folders either used before (seeded commits remember them).
  const known = [...dests];
  for (const d of config.shared.destinations.filter((x) => x.output === "project")) {
    const path = await destinationPath(root, d);
    if (!known.some((k) => k.path === path)) known.push({ path, state: await readState(path).catch(() => ({ commits: {} })) });
  }
  const former = known.flatMap((d) => Object.values(d.state.commits).map((c) => c.elsewhere)).filter((p) => p && !p.startsWith("~") && !isAbsolute(p));
  const outRels = [...new Set([...known.map((d) => outputDirInRepo(root, d.path)).filter(Boolean), ...former])];
  const done = new Set(dests.flatMap((d) => Object.keys(d.state.commits)));
  let baseline = config.baseline === "start" ? null : config.baseline;
  let note = null;
  if (baseline && !(await isAncestor(root, baseline))) {
    note = "The setup baseline commit is no longer in this branch's history (rebase or branch switch), so only recent commits are listed.";
    baseline = null;
  }
  const cap = config.baseline === "start" ? 200 : undefined;
  const shas = (await commitsSince(root, baseline, cap)).filter((sha) => !done.has(sha));

  const commits = [];
  let autoSkipped = 0;
  const remaining = [];
  for (const sha of shas) {
    // Commits that only touch concept output or setup files are skipped every time without being saved:
    // saving would change state.json, which in project mode is itself an uncommitted change, forever.
    const files = await changedFiles(root, sha);
    if (onlySetupFiles(files, outRels)) {
      autoSkipped++;
      continue;
    }
    if (commits.length >= limit) { remaining.push(sha); continue; }
    const meta = await commitMeta(root, sha);
    const { diff, truncated, omitted } = await commitDiff(root, sha, { maxChars: maxDiffChars, excludeDirs: outRels });
    commits.push({ ...meta, seq: await commitSeq(root, sha), files, diff, truncatedFiles: truncated, omittedFiles: omitted });
  }
  return {
    repoRoot: root, outputDir: dests[0].path, outputDirs: dests.map((d) => d.path),
    pendingTotal: commits.length + remaining.length, returned: commits.length, autoSkipped, note, commits,
  };
}

export async function library(repoPath) {
  const { root, dests } = await load(repoPath);
  const { state } = dests[0];
  const concepts = Object.entries(state.concepts).map(([id, c]) => ({ id, name: c.name, kind: c.kind, level: c.level, seen: c.sightings.length }));
  return { repoRoot: root, outputDir: dests[0].path, diagrams: Object.values(state.commits).filter((c) => c.folder && !c.elsewhere).length, concepts };
}

export async function record(input) {
  const problems = checkRecord(input);
  if (problems.length) throw new Error(problems.join("\n"));
  const { root, dests } = await load(input.repoPath);
  const sha = (await git(root, ["rev-parse", "--verify", "-q", `${input.commit}^{commit}`], { allowFail: true }))?.trim();
  if (!sha) throw new Error(`Commit ${input.commit} isn't in ${root}.`);
  const meta = await commitMeta(root, sha);
  const seq = await commitSeq(root, sha);
  const name = await repoName(root);

  if (input.skipReason) {
    for (const d of dests) {
      d.state.commits[sha] = { seq, shortSha: meta.shortSha, date: meta.date, subject: meta.subject, skipped: input.skipReason };
      await writeState(d.path, d.state);
      await writeIndex(d.path, d.state, d.repoName || name, { files: d.files });
    }
    return { commit: meta.shortSha, skipped: true, outputDir: dests[0].path };
  }

  const line = commitLine(meta, seq);
  const written = [];
  for (const d of dests) {
    const { state } = d;
    await fillSeq(root, state);
    // Re-recording a commit replaces its earlier sightings instead of counting them twice.
    const previous = state.commits[sha];
    if (previous?.concepts) {
      for (const id of previous.concepts) {
        const c = state.concepts[id];
        if (!c) continue;
        c.sightings = c.sightings.filter((s) => s.sha !== sha);
        if (!c.sightings.length) delete state.concepts[id];
      }
    }
    const newIds = new Set(input.concepts.filter((c) => !state.concepts[c.id]).map((c) => c.id));
    const folder = previous?.folder && !previous.elsewhere ? previous.folder : commitFolder(meta, input.title, seq);
    const paths = await renderCommit(d.path, folder, { ...input, commit: sha, commitLine: line }, { newIds, files: d.files });

    for (const c of input.concepts) {
      const entry = state.concepts[c.id] ?? { name: c.name, kind: c.kind, level: c.level, explanation: c.explanation, prerequisites: [], learnMore: [], sightings: [] };
      entry.prerequisites = [...new Set([...entry.prerequisites, ...c.prerequisites])].slice(0, 8);
      const urls = new Set(entry.learnMore.map((l) => l.url));
      entry.learnMore = [...entry.learnMore, ...c.learnMore.filter((l) => !urls.has(l.url))].slice(0, 6);
      entry.sightings.push({ sha, seq, shortSha: meta.shortSha, date: meta.date, title: input.title, folder, outputs: d.files, whyHere: c.whyHere, files: c.files });
      state.concepts[c.id] = entry;
    }
    state.commits[sha] = { seq, shortSha: meta.shortSha, date: meta.date, subject: meta.subject, title: input.title, folder, outputs: d.files, concepts: input.concepts.map((c) => c.id) };
    await writeState(d.path, state);
    if (d.files.includes("notes")) for (const c of input.concepts) await writeNote(d.path, c.id, state.concepts[c.id]);
    await writeIndex(d.path, state, d.repoName || name, { files: d.files });
    if (d.output === "library") await writeLibraryIndex(dirname(d.path));
    written.push({ output: d.output, dir: d.path, level: detailLabel(d.files), ...paths, newConcepts: [...newIds] });
  }

  const [first] = written;
  return {
    commit: meta.shortSha, seq, outputDir: first.dir, folder: first.folder, svg: first.svg, excalidraw: first.excalidraw, readme: first.readme,
    newConcepts: first.newConcepts, insideRepo: dests.some((d) => outputDirInRepo(root, d.path)), destinations: written,
  };
}

export async function status(repoPath) {
  const settings = await currentSettings(repoPath);
  if (!settings.configured) return { root: settings.root, configured: false };
  const info = await pending(settings.root, { limit: 0 });
  const lib = await library(settings.root);
  return { ...settings, outputDir: info.outputDir, pending: info.pendingTotal, diagrams: lib.diagrams, concepts: lib.concepts.length };
}
