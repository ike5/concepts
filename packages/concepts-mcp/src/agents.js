import { chmod, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gitPath } from "./git.js";

export const SERVER_NAME = "concepts";
export const PACKAGE = "concepts-mcp";
export const LAUNCH = { command: "npx", args: ["-y", `${PACKAGE}@latest`] };
export const AGENTS = ["claude", "cursor", "codex", "generic"];
const START = "<!-- concepts-mcp:start -->";
const END = "<!-- concepts-mcp:end -->";

/** The workflow, written into AGENTS.md and returned by get_concepts_instructions so both stay in sync. */
export const WORKFLOW = [
  "Call `get_unprocessed_commits` with `repoPath` set to this repository's root. If it says the repository isn't set up, call `setup_concepts` with no choices: it shows the user a picker, or returns the questions to ask with your own multiple-choice tool (recommended option first), and then you call it again with their answers.",
  "Call `get_concept_library` once, so you reuse the ids of concepts already in the library.",
  "For each commit, oldest first, understand the change: read the diff, and the surrounding code when the diff alone doesn't show how the parts fit together.",
  "Model the change as system-design diagrams, not text. Pick the views that teach it best and use as many as it needs: `architecture` (components and how they talk), `sequence` (who calls whom, in order), `flow` (steps and decisions), `state` (states and transitions), `data-model` (entities, fields, relationships). Choose real shapes (database, queue, user, client, external, decision…), group parts into boundaries such as services, layers or trust zones, and include the surrounding parts the reader needs, marking each part and arrow `new`, `changed` or `existing`. Labels are names of 1-4 words; never put sentences in the diagram.",
  "List every concept the commit relies on that is worth learning: patterns, algorithms, data structures, library and framework APIs, language features, protocols, architecture, security and performance ideas. There is no fixed number: a one-line fix may teach one concept, a large feature many. Skip only basics every developer knows. Attach each concept with `appearsIn` to the nodes, edges, participants or messages where it lives; its explanation goes beside the diagram, not in it.",
  "Call `record_commit_concepts` with `title`, `summary`, `views` and `concepts`. For commits with nothing to learn (typos, formatting, version bumps, generated files) pass `skipReason` instead.",
  "Tell the user in one line how many diagrams were added and the path of the newest one. Don't repeat the concepts in chat.",
  "When the user wants to change where diagrams are saved, save to a second folder, or get more or less detail, call `setup_concepts` again the same way.",
];

export function agentsBlock() {
  return `${START}
## Concept diagrams (concepts-mcp)

After every commit you make in this repository, and once at the start of each session, turn new commits into hand-drawn concept diagrams so the user can learn what the code uses. Use the \`concepts\` MCP server's tools; don't write diagram files yourself.

${WORKFLOW.map((s, i) => `${i + 1}. ${s}`).join("\n")}

If the \`concepts\` tools aren't available, tell the user once: \`claude mcp add --scope user concepts -- npx -y concepts-mcp@latest\` (other clients: https://ike5.github.io/concepts/#install), then carry on with the task.
${END}`;
}

/** Insert or replace the managed block, leaving the rest of the file untouched. */
export function upsertBlock(existing, block) {
  if (existing == null || !existing.trim()) return `# AGENTS.md\n\n${block}\n`;
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start !== -1 && end > start) return existing.slice(0, start) + block + existing.slice(end + END.length);
  return `${existing.replace(/\s*$/, "")}\n\n${block}\n`;
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function writeAgentFiles(root, agents) {
  const changed = [];
  const agentsPath = join(root, "AGENTS.md");
  const before = await readOptional(agentsPath);
  const after = upsertBlock(before, agentsBlock());
  if (after !== before) { await writeFile(agentsPath, after); changed.push("AGENTS.md"); }

  // Claude Code reads CLAUDE.md; an @-import pulls AGENTS.md in without duplicating it.
  if (agents.includes("claude")) {
    const claudePath = join(root, "CLAUDE.md");
    const claude = await readOptional(claudePath);
    if (claude == null) { await writeFile(claudePath, "@AGENTS.md\n"); changed.push("CLAUDE.md"); }
    else if (!/^@AGENTS\.md\s*$/m.test(claude)) { await writeFile(claudePath, `@AGENTS.md\n\n${claude}`); changed.push("CLAUDE.md"); }
  }
  return changed;
}

export function installCommands(agents) {
  const launch = `${LAUNCH.command} ${LAUNCH.args.join(" ")}`;
  const json = JSON.stringify({ mcpServers: { [SERVER_NAME]: LAUNCH } }, null, 2);
  const all = {
    claude: { label: "Claude Code", command: `claude mcp add --scope user ${SERVER_NAME} -- ${launch}` },
    codex: { label: "Codex", command: `codex mcp add ${SERVER_NAME} -- ${launch}` },
    cursor: {
      label: "Cursor",
      command: `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(Buffer.from(JSON.stringify(LAUNCH)).toString("base64"))}`,
      note: `Open the link, or add to ~/.cursor/mcp.json:\n${json}`,
    },
    generic: { label: "Any MCP client", command: json, note: "Add this stdio server to your client's MCP config." },
  };
  return agents.filter((a) => all[a]).map((a) => ({ agent: a, ...all[a] }));
}

const HOOK_START = "# concepts-mcp:start";
const HOOK_END = "# concepts-mcp:end";
const HOOK_BODY = `${HOOK_START}
# A reminder only: it never calls an AI or blocks the commit. Your agent diagrams new commits (see AGENTS.md).
echo "concepts-mcp: $(git rev-parse --short HEAD) is ready for a concept diagram. Agents: call get_unprocessed_commits. People: ask your agent to update concepts." >&2
${HOOK_END}`;

/** Add the reminder to post-commit, appending to an existing shell hook instead of replacing it. */
export async function installHook(root) {
  const hooks = await gitPath(root, "hooks");
  const path = join(hooks, "post-commit");
  const existing = await readOptional(path);
  let next;
  if (existing == null) next = `#!/bin/sh\n${HOOK_BODY}\n`;
  else if (existing.includes(HOOK_START)) {
    const s = existing.indexOf(HOOK_START);
    const e = existing.indexOf(HOOK_END) + HOOK_END.length;
    next = existing.slice(0, s) + HOOK_BODY + existing.slice(e);
  } else if (/^#!.*\b(sh|bash|zsh|dash)\b/.test(existing)) next = `${existing.replace(/\s*$/, "")}\n\n${HOOK_BODY}\n`;
  else return { installed: false, path, reason: "An existing post-commit hook isn't a shell script, so it was left alone." };
  await mkdir(dirname(path), { recursive: true });
  if (next !== existing) await writeFile(path, next);
  await chmod(path, 0o755);
  return { installed: true, path };
}
