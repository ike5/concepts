# Idempotent marker-block upsert

_pattern · intermediate_

Write generated text between start/end markers, and replace only that block on later runs. Running setup twice gives the same file, and everything outside the markers is left alone.

## Where it showed up (2)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

.concepts.local.json is added to .gitignore only when no matching line exists.

Files: `packages/concepts-mcp/src/config.js:ignoreLocalConfig`

### 2026-11-06 · [concepts-mcp: an MCP server that draws commits](../commits/2026-11-06-9931945-concepts-mcp-an-mcp-server-that-draws-commits/README.md) · `9931945`

init edits AGENTS.md and the post-commit hook, files that already belong to the user.

Files: `packages/concepts-mcp/src/agents.js:upsertBlock, installHook`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

