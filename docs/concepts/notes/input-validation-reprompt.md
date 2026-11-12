# Validate and re-prompt

_pattern · beginner_

Instead of failing when input is bad, check it right away, explain the problem in one line and ask the same question again with the previous answer kept so it can be fixed.

## Where it showed up (1)

### 2026-11-12 · [Shorter setup with any typed folder](../commits/2026-11-12-1508c11-shorter-setup-with-any-typed-folder/README.md) · `1508c11`

Users may type any folder; ones that can't be used (repo root, outside the repo, a file, unwritable) are asked again in both the CLI loop and the MCP form.

Files: `packages/concepts-mcp/src/cli.js`, `packages/concepts-mcp/src/server.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

