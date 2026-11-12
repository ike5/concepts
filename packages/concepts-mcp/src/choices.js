/**
 * Every setup choice, defined once. The terminal pickers, the MCP form and the questions an agent asks
 * all read from here, so they offer the same options in the same order. The first option is recommended.
 */

/** What a folder can hold for each commit. `notes` = a README per commit plus one note per concept. */
export const FILE_TYPES = ["svg", "excalidraw", "notes"];
export const ALL_FILES = [...FILE_TYPES];

export const WHERE = [
  { value: "project", label: "This project", description: "In the repository, next to the code (docs/concepts/).", recommended: true },
  { value: "library", label: "My learning library", description: "A ConceptLibrary folder on this computer that collects every project, one subfolder each." },
  { value: "both", label: "Both", description: "Save to both folders, each with its own level of detail." },
];

export const DETAIL = [
  { value: "diagram", label: "Diagram", pick: "Just the diagram", description: "Just the diagram: concepts.svg.", files: ["svg"], recommended: true },
  { value: "editable", label: "Editable", pick: "Diagram + editable file", description: "The diagram plus concepts.excalidraw, to open and edit in Excalidraw.", files: ["svg", "excalidraw"] },
  { value: "notes", label: "Diagram + notes", description: "The diagram plus a README for each commit and a note for each concept.", files: ["svg", "notes"] },
  { value: "custom", label: "Custom…", description: "Choose the files yourself." },
];

export const FILES = [
  { value: "svg", label: "Diagram", description: "concepts.svg, a picture that renders on GitHub" },
  { value: "excalidraw", label: "Editable diagram", description: "concepts.excalidraw, for excalidraw.com, Obsidian or VS Code" },
  { value: "notes", label: "Notes", description: "a README per commit and a Markdown note per concept" },
];

export const SCOPE = [
  { value: "shared", label: "Everyone", description: "Save in .concepts.json, which is committed and shared with the team.", recommended: true },
  { value: "personal", label: "Just me", description: "Save in .concepts.local.json, which git ignores. It overrides the shared setting for you only." },
];

export const HOOK = [
  { value: false, label: "No", description: "Your agent still diagrams new commits; AGENTS.md tells it to.", recommended: true },
  { value: true, label: "Yes", description: "A post-commit reminder in the terminal. It never calls an AI." },
];

export const BACKFILL = [
  { value: 0, label: "None", description: "Start with the next commit.", recommended: true },
  { value: 3, label: "Last 3 commits" },
  { value: 10, label: "Last 10 commits" },
];

const PRESETS = Object.fromEntries(DETAIL.filter((d) => d.files).map((d) => [d.value, d.files]));

/** Sort and de-duplicate a list of file types, rejecting unknown ones. */
export function normalizeFiles(files) {
  const list = [...new Set(files)];
  const bad = list.filter((f) => !FILE_TYPES.includes(f));
  if (bad.length) throw new Error(`Unknown file type: ${bad.join(", ")}. Use ${FILE_TYPES.join(", ")}.`);
  if (!list.length) throw new Error("Choose at least one file type.");
  return FILE_TYPES.filter((f) => list.includes(f));
}

/** "diagram" | "editable" | "notes" | "svg,excalidraw" (or "svg+notes") → a sorted list of file types. */
export function parseDetail(value) {
  const text = String(value).trim().toLowerCase();
  if (PRESETS[text]) return [...PRESETS[text]];
  if (text === "all" || text === "everything") return [...ALL_FILES];
  return normalizeFiles(text.split(/[\s,+]+/).filter(Boolean));
}

/** The preset a list of files matches, or null. */
export function presetFor(files) {
  const key = normalizeFiles(files).join(",");
  return DETAIL.find((d) => d.files?.join(",") === key)?.value ?? null;
}

/** A short human name for a list of files: "Diagram", "Editable", or "Custom: svg + notes". */
export function detailLabel(files) {
  const preset = presetFor(files);
  if (preset) return DETAIL.find((d) => d.value === preset).label;
  return normalizeFiles(files).length === FILE_TYPES.length ? "All files" : `Custom: ${normalizeFiles(files).join(" + ")}`;
}

/** The questions an agent asks when its client can't show the server's own form. */
export function agentQuestions() {
  const opts = (list) => list.map(({ value, label, description, recommended }) => ({ value, label: recommended ? `${label} (recommended)` : label, description }));
  return [
    { id: "where", question: "Where should concept diagrams be saved?", multiSelect: false, options: opts(WHERE) },
    { id: "folder", question: "Which folder? (ask once per chosen place; free text with the default offered)", multiSelect: false, freeText: true, defaults: { project: "docs/concepts (any folder inside the repo)", library: "~/Desktop/ConceptLibrary (any folder on this computer; each repo gets a subfolder)" } },
    { id: "detail", question: "How much should each commit save in <folder>? (ask once per chosen folder)", multiSelect: false, options: opts(DETAIL) },
    { id: "files", question: "Which files should <folder> get? (only when Custom was chosen)", multiSelect: true, options: opts(FILES) },
  ];
}
