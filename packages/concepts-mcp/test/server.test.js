import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, stat, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { tempRepo, concept, view, execFile } from "./helpers.js";

const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));

async function connect(repo) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], cwd: repo.root, env: repo.env }));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, text: result.content.map((c) => c.text).join("\n") };
  };
  return { client, call };
}

const exists = (p) => stat(p).then(() => true, () => false);

test("full flow in project mode: setup, pending, record, notes, auto-skip", async () => {
  const repo = await tempRepo();
  await repo.commit({ "src/app.js": "console.log(1)\n" }, "Initial app");
  const { client, call } = await connect(repo);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ["get_concept_library", "get_concepts_instructions", "get_unprocessed_commits", "record_commit_concepts", "setup_concepts"]);

    const before = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.equal(before.isError, true);
    assert.equal(before.structuredContent.notConfigured, true);
    assert.match(before.text, /setup_concepts/);

    const setup = await call("setup_concepts", { repoPath: repo.root, destinations: [{ output: "project", files: ["svg", "excalidraw", "notes"] }], backfill: 1, gitHook: true });
    assert.ok(!setup.isError, setup.text);
    const agents = await readFile(join(repo.root, "AGENTS.md"), "utf8");
    assert.match(agents, /concepts-mcp:start[\s\S]*get_unprocessed_commits[\s\S]*concepts-mcp:end/);
    assert.match(await readFile(join(repo.root, "CLAUDE.md"), "utf8"), /^@AGENTS\.md/m);
    const config = JSON.parse(await readFile(join(repo.root, ".concepts.json"), "utf8"));
    assert.deepEqual(config.destinations, [{ output: "project", dir: "docs/concepts", files: ["svg", "excalidraw", "notes"] }]);
    assert.match(await readFile(join(repo.root, ".git/hooks/post-commit"), "utf8"), /concepts-mcp:start/);

    // The setup files get committed: auto-skipped. Then real work with a lockfile that must not reach the diff.
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "Set up concepts");
    const work = await repo.commit({ "src/retry.js": "export const backoff = (n) => 2 ** n * 100;\n", "package-lock.json": '{"lockfileVersion":3}\n' }, "Add retry with backoff");

    const pending = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.ok(!pending.isError, pending.text);
    const { commits, autoSkipped } = pending.structuredContent;
    assert.equal(autoSkipped, 1);
    assert.deepEqual(commits.map((c) => c.subject), ["Initial app", "Add retry with backoff"], "backfilled commit first, oldest first");
    const diff = commits[1].diff;
    assert.match(diff, /src\/retry\.js/);
    assert.doesNotMatch(diff, /lockfileVersion/);
    assert.ok(commits[1].omittedFiles.includes("package-lock.json"));

    const skip = await call("record_commit_concepts", { repoPath: repo.root, commit: commits[0].sha, skipReason: "Scaffolding only" });
    assert.ok(!skip.isError, skip.text);

    const bad = await call("record_commit_concepts", { repoPath: repo.root, commit: work, title: "t", summary: "s", views: [view()], concepts: [concept("exponential-backoff", { appearsIn: ["nope"] })] });
    assert.equal(bad.isError, true);
    assert.match(bad.text, /appears in "nope"/);

    const rec = await call("record_commit_concepts", {
      repoPath: repo.root, commit: work.slice(0, 7), title: "Retrying with backoff", summary: "Retries wait longer each time.",
      views: [view(), { type: "sequence", title: "Retry", participants: [{ id: "w", label: "Worker" }, { id: "q", label: "Queue", shape: "queue" }], messages: [{ id: "retry", from: "w", to: "q", label: "retry later" }] }],
      concepts: [concept("exponential-backoff", { kind: "algorithm", appearsIn: ["retry", "call"], learnMore: [{ title: "AWS", url: "https://aws.amazon.com/" }] }), concept("jitter", { kind: "algorithm", appearsIn: ["retry"] })],
    });
    assert.ok(!rec.isError, rec.text);
    assert.deepEqual(rec.structuredContent.newConcepts.sort(), ["exponential-backoff", "jitter"]);
    assert.equal(rec.structuredContent.insideRepo, true);
    for (const file of ["svg", "excalidraw", "readme"]) assert.ok(await exists(rec.structuredContent[file]), file);
    assert.match(rec.structuredContent.folder, /docs[\\/]concepts[\\/]commits[\\/]\d{5}-\d{4}-\d{2}-\d{2}-[0-9a-f]{7}-retrying-with-backoff$/);

    const out = join(repo.root, "docs/concepts");
    const note = join(out, "notes/exponential-backoff.md");
    assert.match(await readFile(note, "utf8"), /Where it showed up \(1\)/);
    // The user's own notes survive regeneration.
    await writeFile(note, `${await readFile(note, "utf8")}My takeaway: cap the delay.\n`);
    const index = await readFile(join(out, "README.md"), "utf8");
    assert.match(index, /1 diagrams · 2 concepts · 1 commits skipped/);

    // Committing the generated output is skipped automatically, then a later commit reuses a concept.
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "docs(concepts): retry");
    const later = await repo.commit({ "src/queue.js": "export const q = [];\n" }, "Queue retries");
    const stateBefore = await readFile(join(out, "state.json"), "utf8");
    const pending2 = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.deepEqual(pending2.structuredContent.commits.map((c) => c.sha), [later]);
    assert.equal(pending2.structuredContent.autoSkipped, 2);
    assert.equal(await readFile(join(out, "state.json"), "utf8"), stateBefore, "checking for work never dirties the output folder");

    const lib = await call("get_concept_library", { repoPath: repo.root });
    assert.deepEqual(lib.structuredContent.concepts.map((c) => c.id).sort(), ["exponential-backoff", "jitter"]);

    const rec2 = await call("record_commit_concepts", { repoPath: repo.root, commit: later, title: "A retry queue", summary: "Queue it.", views: [view()], concepts: [concept("exponential-backoff", { kind: "algorithm" }), concept("work-queue", { appearsIn: ["worker"] })] });
    assert.deepEqual(rec2.structuredContent.newConcepts, ["work-queue"]);
    const updated = await readFile(note, "utf8");
    assert.match(updated, /Where it showed up \(2\)/);
    assert.match(updated, /My takeaway: cap the delay\./);
    // Re-recording the same commit replaces it rather than counting it twice.
    await call("record_commit_concepts", { repoPath: repo.root, commit: later, title: "A retry queue", summary: "Queue it.", views: [view()], concepts: [concept("exponential-backoff", { kind: "algorithm" })] });
    assert.match(await readFile(note, "utf8"), /Where it showed up \(2\)/);
    assert.ok(!(await call("get_concept_library", { repoPath: repo.root })).structuredContent.concepts.some((c) => c.id === "work-queue"));

    const done = await call("get_unprocessed_commits", { repoPath: repo.root });
    assert.match(done.text, /Nothing to diagram/);
  } finally {
    await client.close();
  }
});

test("library mode writes to ~/ConceptLibrary/<repo> and a library index", async () => {
  const repo = await tempRepo();
  const sha = await repo.commit({ "a.py": "print(1)\n" }, "First");
  const { client, call } = await connect(repo);
  try {
    const setup = await call("setup_concepts", { repoPath: repo.root, output: "library", agents: ["codex"], backfill: 1 });
    assert.ok(!setup.isError, setup.text);
    assert.equal(setup.structuredContent.outputDir, join(repo.home, "ConceptLibrary", "my-app"));
    assert.equal(setup.structuredContent.config.destinations[0].dir, "~/ConceptLibrary", "home is stored as ~ so the config is portable");
    assert.ok(!(await exists(join(repo.root, "CLAUDE.md"))), "no CLAUDE.md when Claude Code isn't chosen");
    const rec = await call("record_commit_concepts", { repoPath: repo.root, commit: sha, title: "Hello", summary: "Prints.", views: [view()], concepts: [concept("stdout")] });
    assert.ok(!rec.isError, rec.text);
    const library = await readFile(join(repo.home, "ConceptLibrary", "README.md"), "utf8");
    assert.match(library, /\| \[my-app\]\(my-app\/README\.md\) \| 1 \| 1 \|/);
  } finally {
    await client.close();
  }
});

test("setup keeps existing AGENTS.md content and existing hooks, and is idempotent", async () => {
  const repo = await tempRepo();
  await repo.commit({ "AGENTS.md": "# Rules\n\nUse tabs.\n" }, "Rules");
  await mkdir(join(repo.root, ".git/hooks"), { recursive: true });
  await writeFile(join(repo.root, ".git/hooks/post-commit"), "#!/bin/bash\necho existing\n");
  await chmod(join(repo.root, ".git/hooks/post-commit"), 0o755);
  const run = (args) => execFile(process.execPath, [entry, ...args], { cwd: repo.root, env: repo.env });
  const first = await run(["init", "--output", "project", "--agents", "claude,cursor", "--hook", "--yes"]);
  assert.match(first.stdout, /Concept diagrams are on\. Saving to docs\/concepts\./);
  assert.match(first.stdout, /concepts\/#install/);
  assert.ok(first.stdout.trim().split("\n").length <= 6, `init output stays short:\n${first.stdout}`);
  await run(["init", "--output", "project", "--agents", "claude", "--hook", "--yes"]);
  const agents = await readFile(join(repo.root, "AGENTS.md"), "utf8");
  assert.match(agents, /^# Rules\n\nUse tabs\./);
  assert.equal(agents.match(/concepts-mcp:start/g).length, 1);
  const hook = await readFile(join(repo.root, ".git/hooks/post-commit"), "utf8");
  assert.match(hook, /echo existing/);
  assert.equal(hook.match(/concepts-mcp:start/g).length, 1);
  assert.equal((await readFile(join(repo.root, "CLAUDE.md"), "utf8")).match(/@AGENTS\.md/g).length, 1);
  await repo.git("add", "-A");
  await repo.git("commit", "-q", "-m", "setup");
  const commit = await repo.git("log", "-1", "--format=%s");
  assert.equal(commit, "setup");
  const status = await run(["status"]);
  assert.match(status.stdout, /Waiting:\s+0 commits/);
});
