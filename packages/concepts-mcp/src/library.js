import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { ensureDir } from "./config.js";
import { readState } from "./state.js";
import { buildScene } from "./scene.js";
import { toExcalidraw } from "./excalidraw.js";
import { toSvg } from "./svg.js";
import { ALL_FILES } from "./choices.js";

const KEEP = "<!-- Your own notes below this line are kept when this file is regenerated. -->";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "commit";
const day = (iso) => String(iso).slice(0, 10);
const posix = (p) => p.split(sep).join("/");
const md = (s) => String(s).replace(/([\\`*_[\]<>|])/g, "\\$1");
const fileRef = (f) => `\`${f.path.replace(/`/g, "")}${f.lines ? `:${f.lines.replace(/`/g, "")}` : ""}\``;

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

/** "2026-11-06 14:31" from an ISO date, keeping the commit's own clock time. */
export const when = (iso) => String(iso).slice(0, 16).replace("T", " ");

/**
 * The folder for a commit's diagram. The sequence number comes first, zero-padded, so folders sort in
 * commit order even when many commits land on the same day.
 */
export function commitFolder(meta, title, seq) {
  const prefix = seq ? `${String(seq).padStart(5, "0")}-` : "";
  return posix(join("commits", `${prefix}${day(meta.date)}-${meta.shortSha}-${slug(title)}`));
}

/** The line under a diagram's title: "#142 · `9a1b7c0` · 2026-11-06 14:31 · subject". */
export function commitLine(meta, seq) {
  return `${seq ? `#${seq} · ` : ""}\`${meta.shortSha}\` · ${when(meta.date)} · ${meta.subject}`;
}

/** Which files a recorded commit has. Commits recorded before levels existed have all of them. */
const outputsOf = (c) => c.outputs ?? ALL_FILES;

/** The best page to open for a commit: its README, else its diagram, else the editable diagram. */
export function commitPage(c) {
  const out = outputsOf(c);
  const file = out.includes("notes") ? "README.md" : out.includes("svg") ? "concepts.svg" : "concepts.excalidraw";
  return `${c.folder}/${file}`;
}

/** Newest first: by sequence number when both have one, otherwise by date. */
export const newestFirst = (a, b) => (a.seq && b.seq && a.seq !== b.seq ? b.seq - a.seq : String(b.date).localeCompare(String(a.date)));

/** Names of the diagram parts a concept is attached to, for the README ("where to look"). */
function partNames(views) {
  const names = new Map();
  for (const v of views) {
    if (v.type === "sequence") {
      for (const p of v.participants) names.set(p.id, p.label);
      for (const m of v.messages) if (m.id) names.set(m.id, `"${m.label}"`);
    } else {
      for (const g of v.groups) names.set(g.id, g.label);
      for (const n of v.nodes) names.set(n.id, n.label);
      const label = new Map(v.nodes.map((n) => [n.id, n.label]));
      for (const e of v.edges) if (e.id) names.set(e.id, e.label ? `"${e.label}"` : `${label.get(e.from)} → ${label.get(e.to)}`);
    }
  }
  return names;
}

/** Render one commit's chosen files into `dir/<folder>`. Returns the written paths, null for files not chosen. */
export async function renderCommit(dir, folder, record, { newIds, files = ALL_FILES }) {
  const abs = join(dir, folder);
  await ensureDir(abs);
  const notes = files.includes("notes");
  const noteLink = notes ? (c) => posix(relative(abs, join(dir, "notes", `${c.id}.md`))) : () => null;
  const scene = buildScene(record, { newIds, noteLink });
  const paths = { folder: abs, svg: null, excalidraw: null, readme: null };
  if (files.includes("svg")) {
    paths.svg = join(abs, "concepts.svg");
    await writeFile(paths.svg, toSvg(scene));
  }
  if (files.includes("excalidraw")) {
    paths.excalidraw = join(abs, "concepts.excalidraw");
    await writeFile(paths.excalidraw, `${JSON.stringify(toExcalidraw(scene), null, 2)}\n`);
  }
  if (!notes) return paths;

  const names = partNames(record.views);
  const views = record.views.map((v) => `${md(v.title)} (${v.type.replace("-", " ")})`).join(" · ");
  const edit = paths.excalidraw ? " Edit it by opening `concepts.excalidraw` in [excalidraw.com](https://excalidraw.com), Obsidian, or the VS Code Excalidraw extension." : "";
  const lines = [`# ${md(record.title)}`, "", `${record.commitLine}`, "", md(record.summary), ""];
  if (paths.svg) lines.push("![Concept diagram](concepts.svg)", "");
  lines.push(`_Views: ${views}. Numbered markers on the diagram match the concepts below.${edit}_`, "", "## Concepts", "");
  record.concepts.forEach((c, i) => {
    lines.push(`### ${i + 1}. [${md(c.name)}](${noteLink(c)})${newIds.has(c.id) ? " ✦ new" : ""}`, "", `_${c.kind.replace(/-/g, " ")} · ${c.level}_`, "", md(c.explanation), "", `**Why here:** ${md(c.whyHere)}`, "");
    if (c.appearsIn.length) lines.push(`**On the diagram:** ${c.appearsIn.map((r) => md(names.get(r) ?? r)).join(", ")}`, "");
    if (c.files.length) lines.push(`**Files:** ${c.files.map(fileRef).join(", ")}`, "");
  });
  paths.readme = join(abs, "README.md");
  await writeFile(paths.readme, lines.join("\n"));
  return paths;
}

/** One note per concept, rebuilt from state; anything the user wrote below the marker survives. */
export async function writeNote(dir, id, concept) {
  await ensureDir(join(dir, "notes"));
  const path = join(dir, "notes", `${id}.md`);
  const existing = await readOptional(path);
  const kept = existing?.includes(KEEP) ? existing.slice(existing.indexOf(KEEP) + KEEP.length).replace(/^\n/, "") : "\n";
  const lines = [`# ${md(concept.name)}`, "", `_${concept.kind.replace(/-/g, " ")} · ${concept.level}_`, "", md(concept.explanation), ""];
  if (concept.prerequisites?.length) lines.push(`**Learn first:** ${concept.prerequisites.map(md).join(", ")}`, "");
  if (concept.learnMore?.length) lines.push("**Learn more:**", "", ...concept.learnMore.map((l) => `- [${md(l.title)}](<${l.url}>)`), "");
  lines.push(`## Where it showed up (${concept.sightings.length})`, "");
  for (const s of [...concept.sightings].sort(newestFirst)) {
    // A sighting from before the folder moved names the old folder instead of linking to a file that isn't here.
    const title = s.elsewhere ? `${md(s.title)} _(in ${md(s.elsewhere)})_` : `[${md(s.title)}](../${commitPage(s)})`;
    lines.push(`### ${s.seq ? `#${s.seq} · ` : ""}${when(s.date)} · ${title} · \`${s.shortSha}\``, "", md(s.whyHere), "");
    if (s.files?.length) lines.push(`Files: ${s.files.map(fileRef).join(", ")}`, "");
  }
  lines.push("## My notes", "", KEEP, kept.trimEnd(), "");
  await writeFile(path, lines.join("\n"));
  return path;
}

/**
 * The folder's front page: every diagram in commit order, newest first, then the concepts by kind.
 * Concept names link to their notes only when this folder keeps notes.
 */
export async function writeIndex(dir, state, repoLabel, { files = ALL_FILES } = {}) {
  const all = Object.values(state.commits);
  const recorded = all.filter((c) => c.folder && !c.elsewhere).sort(newestFirst);
  const skipped = all.filter((c) => c.skipped).length;
  const notes = files.includes("notes");
  const name = (id) => {
    const label = md(state.concepts[id]?.name ?? id);
    return notes && state.concepts[id] ? `[${label}](notes/${id}.md)` : label;
  };
  const lines = [`# Concepts learned in ${md(repoLabel)}`, "", `${recorded.length} diagrams · ${Object.keys(state.concepts).length} concepts · ${skipped} commits skipped`, ""];
  const elsewhere = {};
  for (const c of all) if (c.elsewhere && c.folder) elsewhere[c.elsewhere] = (elsewhere[c.elsewhere] ?? 0) + 1;
  for (const [path, n] of Object.entries(elsewhere)) lines.push(`_${n} earlier diagram${n === 1 ? " is" : "s are"} in \`${path.replace(/`/g, "")}\`._`, "");
  if (recorded.length) {
    lines.push("## Diagrams", "", "| # | Date | Commit | What it built | Concepts |", "| --- | --- | --- | --- | --- |");
    for (const c of recorded) {
      lines.push(`| ${c.seq ?? ""} | ${when(c.date)} | \`${c.shortSha}\` | [${md(c.title)}](${commitPage(c)}) | ${c.concepts.map(name).join(", ")} |`);
    }
    lines.push("");
  }
  const byKind = {};
  for (const [id, c] of Object.entries(state.concepts)) (byKind[c.kind] ??= []).push([id, c]);
  if (Object.keys(byKind).length) {
    lines.push("## Concepts", "");
    for (const kind of Object.keys(byKind).sort()) {
      lines.push(`**${kind.replace(/-/g, " ")}:** ${byKind[kind].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, c]) => `${name(id)}${c.sightings.length > 1 ? ` ×${c.sightings.length}` : ""}`).join(" · ")}`, "");
    }
  }
  await writeFile(join(dir, "README.md"), lines.join("\n"));
}

/** In library mode, a front page for the whole library listing each repository. */
export async function writeLibraryIndex(libraryRoot) {
  const entries = await readdir(libraryRoot, { withFileTypes: true }).catch(() => []);
  const rows = [];
  for (const e of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const state = await readState(join(libraryRoot, e.name)).catch(() => null);
    if (!state || !Object.keys(state.commits).length) continue;
    const diagrams = Object.values(state.commits).filter((c) => c.folder && !c.elsewhere).length;
    rows.push(`| [${md(e.name)}](${e.name}/README.md) | ${diagrams} | ${Object.keys(state.concepts).length} |`);
  }
  await writeFile(join(libraryRoot, "README.md"), ["# Concept library", "", "Diagrams of the concepts used in your projects' commits, made by concepts-mcp.", "", "| Project | Diagrams | Concepts |", "| --- | --- | --- |", ...rows, ""].join("\n"));
}
