import { McpServer, inputRequired, acceptedContent, CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { z } from "zod";
import { pending, library, record, setup, currentSettings, folderProblem, NotConfiguredError } from "./core.js";
import { AGENTS, WORKFLOW } from "./agents.js";
import { recordInput } from "./schema.js";
import { defaultDir, DEFAULT_PROJECT_DIR, defaultLibraryDir } from "./config.js";
import { DETAIL, FILES, FILE_TYPES, SCOPE, WHERE, agentQuestions, presetFor } from "./choices.js";

export const instructions = "concepts-mcp turns a repository's recent commits into hand-drawn Excalidraw diagrams of the concepts they use, so the user can learn from code an AI wrote. After committing, or when asked to update concepts, call get_concepts_instructions once and follow it. You do the analysis; these tools read git and write the files.";

const repoPath = z.string().max(2000).optional().describe("Absolute path of the repository root. Defaults to the server's working directory.");
const outputs = z.enum(["project", "library"]);
const detail = z.enum(["diagram", "editable", "notes"]);
const files = z.array(z.enum(FILE_TYPES)).min(1).max(3);
const destination = z.object({
  output: outputs.describe("project = a folder in the repo; library = the user's learning library on this computer"),
  dir: z.string().max(500).optional().describe("Folder inside the repo (project) or the library root (library). Omit to keep the current one, or for the default."),
  detail: detail.optional().describe("diagram = concepts.svg only (default); editable = svg + .excalidraw; notes = svg + a README per commit + concept notes"),
  files: files.optional().describe("Custom: exactly which files to write. Overrides detail."),
});

function reply(data, text) {
  return { content: [{ type: "text", text: text ?? JSON.stringify(data, null, 2) }], structuredContent: data };
}

function fail(error) {
  const notConfigured = error instanceof NotConfiguredError;
  return { isError: true, content: [{ type: "text", text: notConfigured ? error.message : `concepts-mcp: ${error.message}` }], structuredContent: { error: error.message, notConfigured } };
}

/** Whether the client can show a form. `{}` is the 2025-06 shape, which meant form mode. */
function canElicit(server, ctx) {
  const caps = ctx?.mcpReq?.envelope?.[CLIENT_CAPABILITIES_META_KEY] ?? server.server.getClientCapabilities();
  const e = caps?.elicitation;
  return Boolean(e && (e.form || !e.url));
}

// Form fields: short titles only. The client draws each choice as its own control (a dropdown in Claude Code).
const titled = (o) => `${o.pick ?? o.label}${o.recommended ? " (recommended)" : ""}`;
const select = (title, options, value) => ({ type: "string", title, oneOf: options.map((o) => ({ const: String(o.value), title: titled(o) })), default: String(value) });
const FOLDER_TITLE = { project: "Folder in this repo", library: "Folder on this computer" };
const FOLDER_HINT = { project: "Any folder inside the repository, e.g. docs/concepts or business_logic/concepts.", library: "e.g. ~/Desktop/ConceptLibrary or Documents/Work. Each repository gets its own subfolder." };
const LEVEL_TITLE = { project: "How much should each commit save in this project?", library: "How much should each commit save in your library?" };
const kindsOf = (where) => (where === "both" ? ["project", "library"] : [where]);

/** Answers carried between form screens. They come back through the client, so they're validated again. */
const answersSchema = z.object({
  where: z.enum(["project", "library", "both"]), scope: z.enum(["shared", "personal"]),
  projectDir: z.string().min(1).max(500), libraryDir: z.string().min(1).max(500),
  projectDetail: z.enum(["diagram", "editable", "notes", "custom"]), libraryDetail: z.enum(["diagram", "editable", "notes", "custom"]),
  projectFiles: files, libraryFiles: files,
}).partial();

function readAnswers(ctx) {
  try { return answersSchema.parse(JSON.parse(ctx.mcpReq.requestState() ?? "{}")); } catch { return {}; }
}

function describeCurrent(current) {
  return current.destinations.map((d) => `${d.shown} (${d.level})`).join(", ");
}

/** The screens still to show, in order, given the answers so far. One question per screen. */
function screens(answers, current) {
  const list = ["where"];
  if (current.configured) list.push("scope");
  if (!answers.where) return list;
  for (const k of kindsOf(answers.where)) {
    list.push(`${k}Dir`, `${k}Detail`);
    if (answers[`${k}Detail`] === "custom") list.push(`${k}Files`);
  }
  return list;
}

/** The single field shown on one screen, with the current setting (or the default) filled in. */
function field(id, answers, current) {
  const k = id.startsWith("library") ? "library" : "project";
  const now = current.destinations.find((d) => d.output === k);
  if (id === "where") {
    const kinds = new Set(current.destinations.map((d) => d.output));
    return select("Where should diagrams go?", WHERE, kinds.size === 2 ? "both" : [...kinds][0] ?? "project");
  }
  if (id === "scope") return select("Save this change for", SCOPE, current.personal ? "personal" : "shared");
  if (id.endsWith("Dir")) return { type: "string", title: FOLDER_TITLE[k], description: FOLDER_HINT[k], default: now?.dir ?? defaultDir(k), minLength: 1, maxLength: 500 };
  if (id.endsWith("Detail")) {
    const title = answers.where === "both" ? LEVEL_TITLE[k] : "How much should each commit save?";
    return select(title, DETAIL, now ? presetFor(now.files) ?? "custom" : "diagram");
  }
  return { type: "array", title: "Which files?", minItems: 1, items: { anyOf: FILES.map((f) => ({ const: f.value, title: f.label })) }, default: now?.files ?? FILE_TYPES };
}

/**
 * The setup picker as MCP forms, one question per screen: where, then for each place its folder and how much
 * it saves (and which files, for Custom). Returns a tool result to send, or the chosen destinations.
 */
async function pickerRound(ctx, current) {
  const responses = ctx.mcpReq.inputResponses ?? {};
  if (Object.values(responses).some((r) => r?.action && r.action !== "accept")) return { done: reply({ cancelled: true }, "The user closed the picker. Nothing changed.") };
  const answers = readAnswers(ctx);
  for (const id of Object.keys(responses)) {
    const value = acceptedContent(responses, id)?.[id];
    const checked = answersSchema.safeParse({ [id]: typeof value === "string" ? value.trim() : value });
    if (checked.success && checked.data[id] !== undefined) answers[id] = checked.data[id];
  }
  // A folder that can't be used is asked again, with the reason and what was typed filled in.
  let problem = null;
  for (const k of ["project", "library"]) {
    const dir = answers[`${k}Dir`];
    if (dir && responses[`${k}Dir`] && (problem = await folderProblem(current.root, k, dir))) {
      delete answers[`${k}Dir`];
      current = { ...current, destinations: [...current.destinations.filter((d) => d.output !== k), { output: k, dir, files: current.destinations.find((d) => d.output === k)?.files ?? ["svg"] }] };
      break;
    }
  }
  const next = screens(answers, current).find((id) => answers[id] === undefined);
  if (next) {
    const message = problem ? `Concept diagrams · ${problem}` : next === "where" && current.configured ? `Concept diagrams · now saving to ${describeCurrent(current)}` : "Concept diagrams";
    return { done: inputRequired({ requestState: JSON.stringify(answers), inputRequests: { [next]: inputRequired.elicit({ message, requestedSchema: { type: "object", properties: { [next]: field(next, answers, current) }, required: [next] } }) } }) };
  }
  return {
    scope: answers.scope ?? (current.personal ? "personal" : "shared"),
    destinations: kindsOf(answers.where).map((k) => ({
      output: k, dir: answers[`${k}Dir`],
      ...(answers[`${k}Detail`] === "custom" ? { files: answers[`${k}Files`] } : { detail: answers[`${k}Detail`] }),
    })),
  };
}

/** For clients without forms: the same questions, for the agent to ask with its own picker. */
function questionsForAgent(current) {
  const line = (q) => q.options.map((o) => `${o.label}${o.description ? ` (${o.description})` : ""}`).join(" · ");
  const [where, folder, level, which] = agentQuestions();
  const lines = [
    current.configured ? `Concept diagrams are saved to ${describeCurrent(current)}${current.personal ? " (your personal setting)" : ""}.` : "Concept diagrams aren't set up in this repository yet.",
    "Ask the user with your multiple-choice tool (AskUserQuestion in Claude Code), one short question at a time, recommended option first:",
    `1. ${where.question} ${line(where)}`,
    `2. For each chosen place, which folder? Offer the default and let them type another: this project → ${folder.defaults.project}; library → ${folder.defaults.library}.`,
    `3. For each chosen place, how much should each commit save? ${line(level)}`,
    `4. Only when Custom is chosen (multi-select): ${which.question.replace(" (only when Custom was chosen)", "").replace("<folder>", "it")} ${line(which)}`,
  ];
  if (current.configured) lines.push(`5. Save this for everyone or just me? ${SCOPE.map((o) => `${titled(o)} (${o.description})`).join(" · ")}`);
  lines.push('Then call setup_concepts again with their answers, e.g. destinations: [{"output":"project","dir":"business_logic/concepts","detail":"diagram"},{"output":"library","dir":"~/Documents/Work","files":["svg","excalidraw","notes"]}]' + (current.configured ? ' and scope: "shared" or "personal".' : "."));
  return lines.join("\n");
}

function setupSummary(result) {
  const where = result.outputDirs.map((d) => `${d.shown} (${d.level})`).join("; ");
  const parts = [`Set up in ${result.root}. Saving to: ${where}.`, `Changed: ${result.changed.join(", ")}${result.scope === "personal" ? " (your personal setting; git ignores it)" : ""}.`];
  for (const s of result.seeded) parts.push(`${s.shown} continues from ${s.shownFrom}: commits already diagrammed there won't be redone.`);
  if (result.left.length) parts.push(`Earlier diagrams stay in ${result.leftShown.join(", ")}.`);
  if (result.personalOverride) parts.push(".concepts.local.json still overrides this for you; delete it to use the shared setting.");
  if (result.hook) parts.push(`Hook: ${result.hook.installed ? result.hook.path : result.hook.reason}`);
  return parts.join(" ");
}

export function createServer(version) {
  const server = new McpServer({ name: "concepts", version }, { instructions });

  server.registerTool("get_concepts_instructions", {
    title: "Get the concept diagram workflow",
    description: "Call first. Returns the steps for turning new commits into concept diagrams.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => reply({ workflow: WORKFLOW, version }, WORKFLOW.map((s, i) => `${i + 1}. ${s}`).join("\n")));

  server.registerTool("setup_concepts", {
    title: "Set up or change concept diagrams",
    description: `Set up a repository, or change where diagrams are saved and how much each commit saves. Call it with no choices: the user gets a picker (where: this project ${DEFAULT_PROJECT_DIR}/, their learning library ${defaultLibraryDir()}/<repo>/, or both; then per folder: Diagram (svg only, recommended), Editable (+ .excalidraw), Diagram + notes (+ README and concept notes), or Custom). If the client can't show it, this returns the questions for you to ask with your own multiple-choice tool; then call again with \`destinations\`. Changes apply to new commits; files already saved stay where they are. Writes .concepts.json (or the gitignored .concepts.local.json for scope "personal"), adds the workflow to AGENTS.md (and an @AGENTS.md import to CLAUDE.md for Claude Code), and optionally a post-commit reminder hook.`,
    inputSchema: z.object({
      repoPath,
      destinations: z.array(destination).min(1).max(2).optional().describe("One entry per folder. Omit to show the user a picker."),
      output: outputs.optional().describe("Shorthand for a single destination"),
      dir: z.string().max(500).optional().describe("Shorthand: the folder for `output`"),
      detail: detail.optional().describe("Shorthand: the level for `output`"),
      scope: z.enum(["shared", "personal"]).optional().describe("shared = .concepts.json for everyone (default); personal = .concepts.local.json, just for this user"),
      agents: z.array(z.enum(AGENTS)).min(1).default(AGENTS).describe("Agents to write instructions for"),
      gitHook: z.boolean().default(false).describe("Add a post-commit hook that reminds people and agents when a commit is waiting"),
      backfill: z.number().int().min(0).max(20).default(0).describe("Also diagram this many commits from before setup"),
    }),
  }, async ({ repoPath, destinations, output, dir, detail, scope, ...options }, ctx) => {
    try {
      let choices = { destinations, output, dir, detail, scope };
      if (!destinations?.length && !output) {
        const current = await currentSettings(repoPath);
        if (!canElicit(server, ctx)) {
          return reply({ needsChoices: true, configured: current.configured, current: current.destinations, questions: agentQuestions(), scopes: current.configured ? SCOPE : undefined }, questionsForAgent(current));
        }
        const round = await pickerRound(ctx, current);
        if (round.done) return round.done;
        choices = round;
      }
      const result = await setup(repoPath, { ...choices, ...options });
      return reply(result, setupSummary(result));
    } catch (error) { return fail(error); }
  });

  server.registerTool("get_unprocessed_commits", {
    title: "Get commits that need a concept diagram",
    description: "Returns commits since setup that have no diagram yet, oldest first, each with its sequence number (its place in history), message, changed files and a trimmed diff (lockfiles and generated files removed). Call record_commit_concepts for each one.",
    inputSchema: z.object({
      repoPath,
      limit: z.number().int().min(1).max(10).default(3).describe("How many commits to return at once"),
      maxDiffChars: z.number().int().min(2000).max(100000).default(24000).describe("Diff budget per commit"),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ repoPath, limit, maxDiffChars }) => {
    try {
      const result = await pending(repoPath, { limit, maxDiffChars });
      if (!result.commits.length) return reply(result, `Nothing to diagram: every commit since setup has a diagram or was skipped.${result.note ? ` ${result.note}` : ""}`);
      return reply(result);
    } catch (error) { return fail(error); }
  });

  server.registerTool("get_concept_library", {
    title: "List concepts already in the library",
    description: "Returns every concept recorded for this repository (id, name, kind, level, times seen). Reuse these ids so a concept's note keeps growing instead of being duplicated.",
    inputSchema: z.object({ repoPath }),
    annotations: { readOnlyHint: true },
  }, async ({ repoPath }) => {
    try { return reply(await library(repoPath)); } catch (error) { return fail(error); }
  });

  server.registerTool("record_commit_concepts", {
    title: "Draw a commit's concept diagram",
    description: "Save one commit as system-design diagrams. Views (architecture, sequence, flow, state, data-model) are laid out and drawn for you in Excalidraw style; each concept becomes a numbered marker on the parts where it lives, with names in a key beside the diagram. Always send the full record (explanations included): each configured folder keeps the files the user chose (concepts.svg, concepts.excalidraw, a README and concept notes), and marks the commit done. Pass skipReason instead for commits with nothing to learn.",
    inputSchema: z.object(recordInput),
  }, async (input) => {
    try {
      const result = await record(input);
      if (result.skipped) return reply(result, `Skipped ${result.commit}.`);
      const lines = [`Diagram for ${result.commit} (#${result.seq}):`];
      for (const d of result.destinations) lines.push(`- ${d.level}: ${d.svg ?? d.readme ?? d.excalidraw}`);
      lines.push(`New concepts: ${result.newConcepts.length ? result.newConcepts.join(", ") : "none"}.`);
      if (result.insideRepo) lines.push("Files inside the repo: commit them on their own (e.g. `docs(concepts): <sha>`); that commit is skipped automatically.");
      return reply(result, lines.join("\n"));
    } catch (error) { return fail(error); }
  });

  return server;
}
