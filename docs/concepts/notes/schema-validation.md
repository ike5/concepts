# Schema validation with Zod

_library · intermediate_

Describe the expected shape of data once and check untrusted input against it at runtime, getting precise errors back. MCP tool schemas are generated from the same definitions.

**Learn more:**

- [Zod](<https://zod.dev/>)

## Where it showed up (2)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

requestState comes back through the client, so earlier answers are re-validated with a Zod schema before setup uses them.

Files: `packages/concepts-mcp/src/server.js:flowState`

### 2026-11-06 · [concepts-mcp: an MCP server that draws commits](../commits/2026-11-06-9931945-concepts-mcp-an-mcp-server-that-draws-commits/README.md) · `9931945`

Everything the agent sends is checked before any file is written, including links and file-name ids.

Files: `packages/concepts-mcp/src/schema.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

