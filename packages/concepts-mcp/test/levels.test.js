import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { tempRepo, concept, view, execFile } from "./helpers.js";
import { select, multiSelect } from "../src/picker.js";
import { parseDetail, detailLabel } from "../src/choices.js";

const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));
const exists = (p) => stat(p).then(() => true, () => false);
const list = (p) => readdir(p).then((x) => x.sort(), () => []);

async function connect(repo, { elicit } = {}) {
  const client = new Client({ name: "test", version: "1.0.0" }, elicit ? { capabilities: { elicitation: { form: {} } } } : undefined);
  if (elicit) client.setRequestHandler("elicitation/create", async (req) => elicit(req.params));
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], cwd: repo.root, env: repo.env }));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, text: result.content.map((c) => c.text).join("\n") };
  };
  return { client, call };
}

const recordArgs = (repo, commit, title) => ({ repoPath: repo.root, commit, title, summary: "s", views: [view()], concepts: [concept("work-queue", { appearsIn: ["worker"] })] });

test("detail presets and labels", () => {
  assert.deepEqual(parseDetail("diagram"), ["svg"]);
  assert.deepEqual(parseDetail("editable"), ["svg", "excalidraw"]);
  assert.deepEqual(parseDetail("notes"), ["svg", "notes"]);
  assert.deepEqual(parseDetail("notes+excalidraw,svg"), ["svg", "excalidraw", "notes"]);
  assert.throws(() => parseDetail("pdf"), /Unknown file type/);
  assert.equal(detailLabel(["svg"]), "Diagram");
  assert.equal(detailLabel(["excalidraw"]), "Custom: excalidraw");
  assert.equal(detailLabel(["notes", "svg", "excalidraw"]), "All files");
});

test("pickers: arrows, numbers, Space and Enter", async () => {
  const io = () => ({ input: new PassThrough(), output: new PassThrough() });
  const options = [{ label: "A", recommended: true }, { label: "B" }, { label: "C" }];

  let s = io();
  let picked = select({ question: "Pick", options, ...s });
  s.input.write("\x1b[B");
  s.input.write("\x1b[B");
  s.input.write("\r");
  assert.equal(await picked, 2);

  s = io();
  picked = select({ question: "Pick", options, defaultIndex: 1, ...s });
  s.input.write("\r");
  assert.equal(await picked, 1, "Enter keeps the default");

  s = io();
  picked = select({ question: "Pick", options, ...s });
  s.input.write("3");
  s.input.write("\r");
  assert.equal(await picked, 2);

  s = io();
  picked = multiSelect({ question: "Files", options, ...s });
  s.input.write(" ");
  s.input.write("\r");
  assert.deepEqual(await picked, [1, 2], "Space unchecks the first option");

  s = io();
  picked = multiSelect({ question: "Files", options, checked: [], ...s });
  s.input.write("\r");
  s.input.write("2");
  s.input.write("\r");
  assert.deepEqual(await picked, [1], "Enter with nothing checked asks again");
});

test("the default level writes just the svg, and commits from the same second keep their order", async () => {
  const repo = await tempRepo();
  repo.env.GIT_AUTHOR_DATE = repo.env.GIT_COMMITTER_DATE = "2026-11-06T12:00:00+00:00";
  const shas = [];
  for (const n of [1, 2, 3]) shas.push(await repo.commit({ [`src/${n}.js`]: `export const n = ${n};\n` }, `Step ${n}`));
  const { client, call } = await connect(repo);
  try {
    const setup = await call("setup_concepts", { repoPath: repo.root, output: "project", backfill: 3 });
    assert.ok(!setup.isError, setup.text);
    assert.match(setup.text, /docs\/concepts \(Diagram\)/);
    const pending = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.deepEqual(pending.structuredContent.commits.map((c) => c.seq), [1, 2, 3]);
    // Record newest first: the order must come from history, not from when diagrams were made.
    for (const [i, sha] of [...shas.entries()].reverse()) {
      const rec = await call("record_commit_concepts", recordArgs(repo, sha, `Step ${i + 1}`));
      assert.ok(!rec.isError, rec.text);
      assert.equal(rec.structuredContent.excalidraw, null);
      assert.equal(rec.structuredContent.readme, null);
    }
    const out = join(repo.root, "docs/concepts");
    const folders = await list(join(out, "commits"));
    assert.deepEqual(folders.map((f) => f.slice(0, 6)), ["00001-", "00002-", "00003-"]);
    assert.match(folders[1], /^00002-2026-11-06-[0-9a-f]{7}-step-2$/);
    assert.deepEqual(await list(join(out, "commits", folders[1])), ["concepts.svg"]);
    assert.ok(!(await exists(join(out, "notes"))), "no notes at the Diagram level");
    assert.match(await readFile(join(out, "commits", folders[1], "concepts.svg"), "utf8"), /#2 · /);
    const index = await readFile(join(out, "README.md"), "utf8");
    const rows = index.split("\n").filter((l) => /^\| \d/.test(l));
    assert.deepEqual(rows.map((r) => r.split("|")[1].trim()), ["3", "2", "1"]);
    assert.match(rows[0], /2026-11-06 12:00/);
    assert.match(rows[0], /\(commits\/00003-[^)]*\/concepts\.svg\)/, "rows link to the svg when there's no README");
    assert.doesNotMatch(index, /notes\//);
  } finally {
    await client.close();
  }
});

test("two folders at different levels, moving one, and a personal override", async () => {
  const repo = await tempRepo();
  const first = await repo.commit({ "src/a.js": "1\n" }, "First");
  const { client, call } = await connect(repo);
  try {
    const setup = await call("setup_concepts", { repoPath: repo.root, backfill: 1, destinations: [{ output: "project", detail: "diagram" }, { output: "library", files: ["svg", "excalidraw", "notes"] }] });
    assert.ok(!setup.isError, setup.text);
    const lib = join(repo.home, "ConceptLibrary", "my-app");
    const proj = join(repo.root, "docs/concepts");

    const rec = await call("record_commit_concepts", recordArgs(repo, first, "First"));
    assert.ok(!rec.isError, rec.text);
    assert.equal(rec.structuredContent.destinations.length, 2);
    const [projFolder] = await list(join(proj, "commits"));
    const [libFolder] = await list(join(lib, "commits"));
    assert.deepEqual(await list(join(proj, "commits", projFolder)), ["concepts.svg"]);
    assert.deepEqual(await list(join(lib, "commits", libFolder)), ["README.md", "concepts.excalidraw", "concepts.svg"]);
    assert.ok(await exists(join(lib, "notes/work-queue.md")));
    assert.ok(!(await exists(join(proj, "notes"))));

    // Move the project folder: the old one stays, and the new one doesn't redo what was already diagrammed.
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "docs(concepts): first");
    const moved = await call("setup_concepts", { repoPath: repo.root, destinations: [{ output: "project", dir: "docs/learn" }, { output: "library" }] });
    assert.ok(!moved.isError, moved.text);
    assert.match(moved.text, /docs\/concepts/);
    assert.ok(await exists(join(proj, "commits", projFolder, "concepts.svg")), "old files stay");
    assert.deepEqual(moved.structuredContent.config.destinations.map((d) => d.files), [["svg"], ["svg", "excalidraw", "notes"]], "levels are kept when not given");
    assert.match(await readFile(join(repo.root, "docs/learn/README.md"), "utf8"), /1 earlier diagram is in `docs\/concepts`/);
    assert.equal((await call("get_unprocessed_commits", { repoPath: repo.root })).structuredContent.pendingTotal, 0);
    const lib2 = await call("get_concept_library", { repoPath: repo.root });
    assert.deepEqual(lib2.structuredContent.concepts.map((c) => c.id), ["work-queue"], "concept ids carry over");

    // Just for me: only the library, editable. The shared config is untouched.
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "move concepts");
    const shared = await readFile(join(repo.root, ".concepts.json"), "utf8");
    const mine = await call("setup_concepts", { repoPath: repo.root, scope: "personal", destinations: [{ output: "library", detail: "editable" }] });
    assert.ok(!mine.isError, mine.text);
    assert.equal(await readFile(join(repo.root, ".concepts.json"), "utf8"), shared);
    assert.match(await readFile(join(repo.root, ".gitignore"), "utf8"), /^\.concepts\.local\.json$/m);
    const second = await repo.commit({ "src/b.js": "2\n" }, "Second");
    const rec2 = await call("record_commit_concepts", recordArgs(repo, second, "Second"));
    assert.deepEqual(rec2.structuredContent.destinations.map((d) => d.level), ["Editable"]);
    const libFolders = await list(join(lib, "commits"));
    assert.equal(libFolders.length, 2);
    assert.deepEqual(await list(join(lib, "commits", libFolders[1])), ["concepts.excalidraw", "concepts.svg"]);
    assert.equal((await list(join(repo.root, "docs/learn/commits"))).length, 0, "the shared project folder isn't written for this person");
    // A teammate's diagram commit (only the shared folder) is still skipped for this person.
    await repo.commit({ "docs/learn/commits/00009-x/concepts.svg": "<svg/>\n" }, "docs(concepts): teammate");
    const left = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.equal(left.structuredContent.pendingTotal, 0, left.text);
  } finally {
    await client.close();
  }
});

test("a version 1 config keeps writing every file", async () => {
  const repo = await tempRepo();
  const base = await repo.commit({ "a.js": "1\n" }, "Base");
  const work = await repo.commit({ "b.js": "2\n" }, "Work");
  await writeFile(join(repo.root, ".concepts.json"), JSON.stringify({ version: 1, output: "project", dir: "docs/concepts", baseline: base }));
  const { client, call } = await connect(repo);
  try {
    const rec = await call("record_commit_concepts", recordArgs(repo, work, "Work"));
    assert.ok(!rec.isError, rec.text);
    for (const f of ["svg", "excalidraw", "readme"]) assert.ok(await exists(rec.structuredContent[f]), f);
  } finally {
    await client.close();
  }
});

test("setup without choices: the agent gets the questions when its client can't show a form", async () => {
  const repo = await tempRepo();
  await repo.commit({ "a.js": "1\n" }, "Base");
  const { client, call } = await connect(repo);
  try {
    const res = await call("setup_concepts", { repoPath: repo.root });
    assert.ok(!res.isError, res.text);
    assert.equal(res.structuredContent.needsChoices, true);
    assert.deepEqual(res.structuredContent.questions.map((q) => q.id), ["where", "folder", "detail", "files"]);
    assert.match(res.structuredContent.questions[2].options[0].label, /^Diagram \(recommended\)$/);
    assert.match(res.text, /AskUserQuestion/);
    assert.ok(!(await exists(join(repo.root, ".concepts.json"))), "nothing is written until the user answers");
  } finally {
    await client.close();
  }
});

test("setup without choices shows a form, one question per screen, with folders you can type", async () => {
  const repo = await tempRepo();
  await repo.commit({ "a.js": "1\n" }, "Base");
  const asked = [];
  const answers = {
    where: "both",
    projectDir: "business_logic",
    projectDetail: "diagram",
    libraryDir: "Documents/Work",
    libraryDetail: "custom",
    libraryFiles: ["svg", "notes"],
  };
  const { client, call } = await connect(repo, {
    elicit: (params) => {
      const keys = Object.keys(params.requestedSchema.properties);
      assert.equal(keys.length, 1, "one question per screen");
      asked.push({ key: keys[0], field: params.requestedSchema.properties[keys[0]] });
      return { action: "accept", content: { [keys[0]]: answers[keys[0]] } };
    },
  });
  try {
    const res = await call("setup_concepts", { repoPath: repo.root });
    assert.ok(!res.isError, res.text);
    assert.deepEqual(asked.map((a) => a.key), ["where", "projectDir", "projectDetail", "libraryDir", "libraryDetail", "libraryFiles"]);
    const where = asked[0].field;
    assert.equal(where.default, "project");
    assert.equal(where.oneOf[0].title, "This project (recommended)");
    assert.equal(where.description, undefined, "no wall of explanations");
    assert.equal(asked[1].field.default, "docs/concepts");
    assert.equal(asked[2].field.oneOf[0].title, "Just the diagram (recommended)");
    const config = JSON.parse(await readFile(join(repo.root, ".concepts.json"), "utf8"));
    assert.deepEqual(config.destinations.map((d) => [d.output, d.dir, d.files]), [
      ["project", "business_logic", ["svg"]],
      ["library", "~/Documents/Work", ["svg", "notes"]],
    ], "a library folder without ~ counts from the home folder");
    assert.ok(await exists(join(repo.root, "business_logic/README.md")));
    assert.ok(await exists(join(repo.home, "Documents/Work/my-app/README.md")));
  } finally {
    await client.close();
  }
});

test("any folder can be typed; ones that can't be used are asked again", async () => {
  const repo = await tempRepo();
  await repo.commit({ "a.js": "1\n" }, "Base");
  const typed = { projectDir: ["../outside", join(repo.root, "notes", "My Learning")] };
  const messages = [];
  const { client, call } = await connect(repo, {
    elicit: (params) => {
      const key = Object.keys(params.requestedSchema.properties)[0];
      messages.push(params.message);
      const value = key === "where" ? "project" : key === "projectDir" ? typed.projectDir.shift() : "diagram";
      return { action: "accept", content: { [key]: value } };
    },
  });
  try {
    const res = await call("setup_concepts", { repoPath: repo.root });
    assert.ok(!res.isError, res.text);
    assert.ok(messages.some((m) => /Choose a folder inside this repository/.test(m)), messages.join("\n"));
    const config = JSON.parse(await readFile(join(repo.root, ".concepts.json"), "utf8"));
    assert.equal(config.destinations[0].dir, "notes/My Learning", "a full path inside the repo is stored relative to it");
    const bad = await call("setup_concepts", { repoPath: repo.root, destinations: [{ output: "library", dir: "/" }] });
    assert.equal(bad.isError, true);
    assert.match(bad.text, /You can't save files in/);
  } finally {
    await client.close();
  }
});

test("closing the form changes nothing", async () => {
  const repo = await tempRepo();
  await repo.commit({ "a.js": "1\n" }, "Base");
  const { client, call } = await connect(repo, { elicit: () => ({ action: "decline" }) });
  try {
    const res = await call("setup_concepts", { repoPath: repo.root });
    assert.match(res.text, /Nothing changed/);
    assert.ok(!(await exists(join(repo.root, ".concepts.json"))));
  } finally {
    await client.close();
  }
});

test("CLI: init --yes picks the recommended choices; settings flags add a second folder", async () => {
  const repo = await tempRepo();
  await repo.commit({ "a.js": "1\n" }, "Base");
  const run = (args) => execFile(process.execPath, [entry, ...args], { cwd: repo.root, env: repo.env });
  const init = await run(["init", "--yes"]);
  assert.match(init.stdout, /Saving to docs\/concepts\./);
  assert.doesNotMatch(init.stdout, /mcpServers/, "no install JSON dumped");
  let config = JSON.parse(await readFile(join(repo.root, ".concepts.json"), "utf8"));
  assert.deepEqual(config.destinations, [{ output: "project", dir: "docs/concepts", files: ["svg"] }]);
  const changed = await run(["settings", "--where", "both", "--library-detail", "svg,excalidraw,notes", "--scope", "shared"]);
  assert.match(changed.stdout, /All files/);
  config = JSON.parse(await readFile(join(repo.root, ".concepts.json"), "utf8"));
  assert.deepEqual(config.destinations.map((d) => [d.output, d.files]), [["project", ["svg"]], ["library", ["svg", "excalidraw", "notes"]]]);
  const status = await run(["status"]);
  assert.match(status.stdout, /ConceptLibrary[\\/]my-app {2}→ {2}All files/);
});
