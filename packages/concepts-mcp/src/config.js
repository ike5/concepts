import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { repoName } from "./git.js";
import { ALL_FILES, normalizeFiles } from "./choices.js";

export const CONFIG_FILE = ".concepts.json";
/** A personal override, ignored by git: when it lists destinations they replace the shared ones for this person. */
export const LOCAL_CONFIG_FILE = ".concepts.local.json";
export const DEFAULT_PROJECT_DIR = "docs/concepts";
export const OUTPUTS = ["project", "library"];

/** ~/Desktop/ConceptLibrary when a Desktop folder exists, otherwise ~/ConceptLibrary. */
export function defaultLibraryDir() {
  const desktop = join(homedir(), "Desktop");
  return existsSync(desktop) ? "~/Desktop/ConceptLibrary" : "~/ConceptLibrary";
}

export const defaultDir = (output) => (output === "project" ? DEFAULT_PROJECT_DIR : defaultLibraryDir());

export function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** Store paths under the home folder as ~/… so a committed config doesn't leak a username or break for teammates. */
export function contractHome(path) {
  const home = homedir();
  const rel = relative(home, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `~/${rel.split(sep).join("/")}` : path;
}

/** Tidy a folder setting the way it's stored: project folders relative to the repo, library folders with ~. */
export function normalizeDir(output, dir) {
  if (output === "project") return (dir || DEFAULT_PROJECT_DIR).replace(/^\.\/+/, "").replace(/\/+$/, "") || DEFAULT_PROJECT_DIR;
  // A library folder typed without ~ or a leading / (e.g. "Documents/Work") counts from the home folder, not the repo.
  const expanded = expandHome(dir || defaultLibraryDir());
  return contractHome(isAbsolute(expanded) ? resolve(expanded) : join(homedir(), expanded));
}

function checkDestination(d, file) {
  if (!d || !OUTPUTS.includes(d.output) || typeof d.dir !== "string") {
    throw new Error(`${file}: each destination needs "output" ("project" or "library") and "dir".`);
  }
  const out = { output: d.output, dir: d.dir, files: normalizeFiles(d.files ?? ALL_FILES) };
  if (d.repoName) out.repoName = String(d.repoName);
  return out;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

/**
 * The committed config as version 2. Version 1 (`{output, dir}`) becomes one destination that keeps
 * writing every file type, so upgrading changes nothing until someone changes the settings.
 */
export async function readSharedConfig(root) {
  const raw = await readJson(join(root, CONFIG_FILE));
  if (!raw) return null;
  try {
    const list = Array.isArray(raw.destinations) ? raw.destinations : [{ output: raw.output, dir: raw.dir, repoName: raw.repoName, files: ALL_FILES }];
    if (!list.length) throw new Error("add at least one destination.");
    return { version: 2, baseline: raw.baseline ?? "start", destinations: list.map((d) => checkDestination(d, CONFIG_FILE)) };
  } catch (error) {
    throw new Error(`Could not read ${CONFIG_FILE}: ${error.message}`);
  }
}

export async function readLocalConfig(root) {
  const raw = await readJson(join(root, LOCAL_CONFIG_FILE));
  if (!raw?.destinations?.length) return null;
  return { destinations: raw.destinations.map((d) => checkDestination(d, LOCAL_CONFIG_FILE)) };
}

/** The config that applies to this person: the shared file, with destinations replaced by the local override if there is one. */
export async function readConfig(root) {
  const shared = await readSharedConfig(root);
  if (!shared) return null;
  const local = await readLocalConfig(root);
  return { ...shared, destinations: local?.destinations ?? shared.destinations, personal: Boolean(local), shared };
}

export async function writeConfig(root, { baseline, destinations }) {
  await writeFile(join(root, CONFIG_FILE), `${JSON.stringify({ version: 2, baseline, destinations }, null, 2)}\n`);
}

export async function writeLocalConfig(root, { destinations }) {
  await writeFile(join(root, LOCAL_CONFIG_FILE), `${JSON.stringify({ destinations }, null, 2)}\n`);
}

/** Make sure git ignores the personal override. Returns true when .gitignore changed. */
export async function ignoreLocalConfig(root) {
  const path = join(root, ".gitignore");
  const existing = (await readFile(path, "utf8").catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)))) ?? "";
  if (existing.split(/\r?\n/).some((l) => l.trim() === LOCAL_CONFIG_FILE || l.trim() === `/${LOCAL_CONFIG_FILE}`)) return false;
  await writeFile(path, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${LOCAL_CONFIG_FILE}\n`);
  return true;
}

/**
 * The absolute folder a destination writes to. Project: a folder inside the repo. Library: one subfolder
 * per repo inside the user's learning library, so every project feeds the same library.
 */
export async function destinationPath(root, d) {
  if (d.output === "project") {
    const dir = resolve(root, d.dir);
    const rel = relative(root, dir);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Project output "${d.dir}" must be a folder inside the repository.`);
    return dir;
  }
  return join(resolve(expandHome(d.dir)), d.repoName || (await repoName(root)));
}

/** The output folder relative to the repo root when it lives inside the repo (so its commits can be skipped), else null. */
export function outputDirInRepo(root, dir) {
  const rel = relative(root, dir);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : null;
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}
