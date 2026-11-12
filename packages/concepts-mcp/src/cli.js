import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { currentSettings, setup, status } from "./core.js";
import { AGENTS, installCommands } from "./agents.js";
import { contractHome, defaultDir, ensureDir } from "./config.js";
import { recordSchema, checkRecord } from "./schema.js";
import { renderCommit } from "./library.js";
import { ALL_FILES, BACKFILL, DETAIL, FILES, FILE_TYPES, HOOK, SCOPE, WHERE, detailLabel, parseDetail, presetFor } from "./choices.js";
import { CancelledError, pickers } from "./picker.js";

export const usage = `concepts-mcp: hand-drawn diagrams of the concepts in your latest commits

  npx -y concepts-mcp@latest init      Set up this repository (pickers for where and how much)
  npx -y concepts-mcp@latest settings  Change folders or detail level at any time
  npx -y concepts-mcp@latest status    Show where diagrams go and how many commits are waiting
  npx -y concepts-mcp@latest render <concepts.json> [out-dir]
                                       Draw a diagram from a JSON file (for trying it out)
  concepts-mcp                         With no command and no terminal, runs the MCP server

Where and how much (init and settings):
  --where project|library|both          --detail diagram|editable|notes|svg,excalidraw,notes
  --project-dir <path>  --project-detail <level>    --library-dir <path>  --library-detail <level>
  --scope shared|personal               shared = .concepts.json; personal = .concepts.local.json (gitignored)
init only: --agents claude,cursor,codex,generic  --hook | --no-hook  --backfill <n>
  --yes accepts the recommended choices without asking
Docs: https://ike5.github.io/concepts/`;

const KIND = { project: "This project", library: "Learning library" };
const AGENT_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "codex", label: "Codex" },
  { value: "generic", label: "Any MCP client", description: "via AGENTS.md" },
];
const PLACE_FLAGS = ["where", "output", "dir", "detail", "project-dir", "library-dir", "project-detail", "library-detail"];

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const [key, inline] = a.slice(2).split("=", 2);
    if (key.startsWith("no-")) flags[key.slice(3)] = false;
    else if (inline !== undefined) flags[key] = inline;
    else if (args[i + 1] && !args[i + 1].startsWith("--")) flags[key] = args[++i];
    else flags[key] = true;
  }
  return flags;
}

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

async function pickFolder(ui, kind, current) {
  const fallback = current ?? defaultDir(kind);
  const options = [
    { value: fallback, label: fallback, description: current ? "where it is now" : kind === "library" ? "each repository gets its own subfolder" : "inside the repository", recommended: true },
    { value: "", label: "Other…", description: "type a folder" },
  ];
  return (await ui.one(`${KIND[kind]}: which folder?`, options)) || ui.text(`${KIND[kind]} folder:`, fallback);
}

async function pickFiles(ui, kind, currentFiles) {
  const now = currentFiles ? presetFor(currentFiles) ?? "custom" : "diagram";
  const level = await ui.one(`${KIND[kind]}: how much should each commit save?`, DETAIL, DETAIL.findIndex((d) => d.value === now));
  if (level !== "custom") return DETAIL.find((d) => d.value === level).files;
  const checked = (currentFiles ?? ALL_FILES).map((f) => FILE_TYPES.indexOf(f));
  return ui.many(`${KIND[kind]}: which files?`, FILES, checked);
}

/** Where diagrams go and how much each folder keeps, from flags first, then pickers, then the current settings. */
async function chooseDestinations(flags, ui, current = []) {
  const kinds = new Set(current.map((d) => d.output));
  const now = kinds.size === 2 ? "both" : [...kinds][0] ?? "project";
  const where = str(flags.where) ?? str(flags.output) ?? (await ui.one("Where should concept diagrams be saved?", WHERE, WHERE.findIndex((w) => w.value === now)));
  if (!WHERE.some((w) => w.value === where)) throw new Error('--where must be "project", "library" or "both".');
  const chosen = where === "both" ? ["project", "library"] : [where];
  const out = [];
  for (const k of chosen) {
    const was = current.find((d) => d.output === k);
    const single = chosen.length === 1;
    const dir = str(flags[`${k}-dir`]) ?? (single ? str(flags.dir) : undefined) ?? (await pickFolder(ui, k, was?.dir));
    const level = str(flags[`${k}-detail`]) ?? (single ? str(flags.detail) : undefined);
    const files = level ? parseDetail(level) : await pickFiles(ui, k, was?.files);
    out.push({ output: k, dir, files });
  }
  return out;
}

function printSaved(result) {
  console.log(`\n✓ ${result.scope === "personal" ? "Saved just for you in .concepts.local.json (git ignores it)" : `Set up in ${result.root}`}`);
  for (const d of result.outputDirs) console.log(`  ${contractHome(d.dir)}  →  ${d.level}`);
  console.log(`  Updated ${result.changed.join(", ")}`);
  for (const s of result.seeded) console.log(`  ${s.dir} continues from ${s.from}; diagrammed commits won't be redone.`);
  if (result.left.length) console.log(`  Earlier diagrams stay in ${result.left.join(", ")}`);
  if (result.personalOverride) console.log("  Note: your .concepts.local.json still overrides this for you. Delete it to use the shared setting.");
  if (result.hook) console.log(result.hook.installed ? `  Hook: ${result.hook.path}` : `  Hook skipped: ${result.hook.reason}`);
}

async function init(flags) {
  const ui = pickers({ interactive: Boolean(process.stdin.isTTY) && !flags.yes });
  const now = await currentSettings(process.cwd());
  const destinations = await chooseDestinations(flags, ui, now.destinations);
  const agentsRaw = str(flags.agents);
  const agents = agentsRaw ? agentsRaw.split(/[\s,]+/).map((a) => a.toLowerCase()).filter(Boolean) : await ui.many("Which agents do you use?", AGENT_OPTIONS);
  const bad = agents.filter((a) => !AGENTS.includes(a));
  if (bad.length) throw new Error(`Unknown agent: ${bad.join(", ")}. Use ${AGENTS.join(", ")}.`);
  const gitHook = flags.hook !== undefined ? flags.hook === true || /^y/i.test(String(flags.hook)) : await ui.one("Add a post-commit reminder hook?", HOOK);
  const backfill = flags.backfill !== undefined ? Number(flags.backfill) || 0 : await ui.one("Diagram some recent commits now?", BACKFILL);
  const scope = str(flags.scope) ?? "shared";
  if (!SCOPE.some((s) => s.value === scope)) throw new Error('--scope must be "shared" or "personal".');

  const result = await setup(process.cwd(), { destinations, scope, agents, gitHook, backfill });
  printSaved(result);
  console.log("\nAdd the MCP server to your agent (once per machine):");
  for (const cmd of installCommands(agents)) console.log(`\n  ${cmd.label}:\n  ${cmd.command.split("\n").join("\n  ")}${cmd.note && cmd.agent !== "generic" ? `\n  ${cmd.note.split("\n").join("\n  ")}` : ""}`);
  console.log("\nThen commit as usual. Your agent diagrams each new commit, or ask it to \"update my concept diagrams\".");
  console.log("Change folders or detail later with: npx -y concepts-mcp@latest settings");
}

function printCurrent(now) {
  console.log(`Concept diagrams in ${now.root}${now.personal ? " (your personal setting, .concepts.local.json)" : ""}:`);
  for (const d of now.destinations) console.log(`  ${contractHome(d.path)}  →  ${d.level}`);
}

async function settings(flags) {
  const now = await currentSettings(process.cwd());
  if (!now.configured) throw new Error("Not set up yet. Run: npx -y concepts-mcp@latest init");
  const interactive = Boolean(process.stdin.isTTY) && !flags.yes;
  const ui = pickers({ interactive });
  printCurrent(now);
  let destinations = now.destinations.map(({ output, dir, files }) => ({ output, dir, files }));

  if (PLACE_FLAGS.some((k) => k in flags)) {
    destinations = await chooseDestinations(flags, pickers({ interactive: false }), now.destinations);
  } else if (!interactive) {
    console.log("\nRun this in a terminal to pick changes, or pass flags (see --help).");
    return;
  } else {
    const which = async (question) => {
      if (destinations.length === 1) return destinations[0];
      const i = await ui.one(question, destinations.map((d, i) => ({ value: i, label: `${KIND[d.output]}: ${d.dir}`, description: detailLabel(d.files) })));
      return destinations[i];
    };
    const actions = [
      { value: "detail", label: "How much each commit saves", description: "Diagram, Editable, Diagram + notes or Custom", recommended: true },
      { value: "folder", label: "Where a folder is", description: "files already saved stay where they are" },
      destinations.length < 2
        ? { value: "add", label: "Add a second folder", description: "e.g. a light version in the repo and every file in your library" }
        : { value: "remove", label: "Stop saving to a folder", description: "its files stay where they are" },
    ];
    const action = await ui.one("What would you like to change?", actions);
    if (action === "detail") {
      const d = await which("Which folder?");
      d.files = await pickFiles(ui, d.output, d.files);
    } else if (action === "folder") {
      const d = await which("Which folder?");
      d.dir = await ui.text(`New ${KIND[d.output].toLowerCase()} folder:`, d.dir);
    } else if (action === "add") {
      const output = destinations[0].output === "project" ? "library" : "project";
      destinations.push({ output, dir: await pickFolder(ui, output), files: await pickFiles(ui, output) });
    } else {
      const d = await which("Stop saving to which folder?");
      destinations = destinations.filter((x) => x !== d);
    }
  }
  const scope = str(flags.scope) ?? (await ui.one("Save this change for", SCOPE, now.personal ? 1 : 0));
  if (!SCOPE.some((s) => s.value === scope)) throw new Error('--scope must be "shared" or "personal".');
  printSaved(await setup(process.cwd(), { destinations, scope, agents: ["generic"] }));
  console.log("  Changes apply to new commits.");
}

async function render(args) {
  const [file, out = "concepts-output"] = args;
  if (!file) throw new Error("render needs a JSON file: see examples/commit.json");
  const input = recordSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const problems = checkRecord(input);
  if (problems.length) throw new Error(problems.join("\n"));
  const dir = await ensureDir(resolve(out));
  const commitLine = input.commitLine ?? `\`${input.commit.slice(0, 7)}\` · example`;
  const files = await renderCommit(dir, ".", { ...input, commitLine }, { newIds: new Set(input.concepts.map((c) => c.id)), files: ALL_FILES });
  console.log(`SVG:        ${files.svg}\nExcalidraw: ${files.excalidraw}`);
}

export async function main(argv) {
  const [command, ...rest] = argv;
  try {
    if (command === "init") return await init(parseFlags(rest));
    if (command === "settings" || command === "config") return await settings(parseFlags(rest));
    if (command === "status") {
      const s = await status(process.cwd());
      if (!s.configured) return console.log(`Not set up in ${s.root}. Run: npx -y concepts-mcp@latest init`);
      const where = s.destinations.map((d) => `\n    ${contractHome(d.path)}  →  ${d.level}`).join("");
      return console.log(`${s.root}\n  Saving to:${where}${s.personal ? "\n  Setting:  personal (.concepts.local.json)" : ""}\n  Diagrams: ${s.diagrams}\n  Concepts: ${s.concepts}\n  Waiting:  ${s.pending} commit${s.pending === 1 ? "" : "s"}`);
    }
    if (command === "render") return await render(rest);
    console.log(usage);
    if (command && !["help", "--help", "-h"].includes(command)) process.exitCode = 1;
  } catch (error) {
    if (error instanceof CancelledError) {
      console.error(error.message);
      process.exitCode = 130;
      return;
    }
    console.error(`concepts-mcp: ${error.message}`);
    process.exitCode = 1;
  }
}
