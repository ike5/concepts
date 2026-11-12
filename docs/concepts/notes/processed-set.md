# Watermark + processed set

_pattern · intermediate_

Remember where you started (a watermark) and which items are done, then compute the work left as 'everything after the watermark minus what's done'. Nothing is missed and nothing is done twice, however irregularly the job runs.

## Where it showed up (2)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

A new or moved folder is seeded with the processed commits from an existing one, and pending work is the union across folders, so nothing is redone.

Files: `packages/concepts-mcp/src/core.js:seeded`

### 2026-11-06 · [concepts-mcp: an MCP server that draws commits](../commits/2026-11-06-9931945-concepts-mcp-an-mcp-server-that-draws-commits/README.md) · `9931945`

Agents don't run after every commit, so the server works out what's pending from git history instead of trusting the last commit.

Files: `packages/concepts-mcp/src/core.js:pending`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

