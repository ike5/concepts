# Path traversal prevention

_security · intermediate_

If user-supplied text becomes part of a file path, values like ../../ can escape the intended folder. Restricting ids to a safe pattern closes that hole.

## Where it showed up (2)

### 2026-11-12 · [Shorter setup with any typed folder](../commits/2026-11-12-1508c11-shorter-setup-with-any-typed-folder/README.md) · `1508c11`

Typed project folders are resolved against the repo and rejected if relative() starts with '..' or is empty.

### 2026-11-06 · [concepts-mcp: an MCP server that draws commits](../commits/2026-11-06-9931945-concepts-mcp-an-mcp-server-that-draws-commits/README.md) · `9931945`

Concept ids become note file names, so they must match a lowercase slug pattern.

Files: `packages/concepts-mcp/src/schema.js:slug`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

