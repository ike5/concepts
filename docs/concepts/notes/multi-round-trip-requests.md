# Multi-round-trip requests

_protocol · advanced_

Instead of the server calling back into the client mid-request, a handler returns 'input required' with the questions and an opaque requestState. The client gathers the answers and retries the same call with them, so the server can stay stateless between rounds.

**Learn first:** MCP elicitation

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

Each round only brings back the latest answers, so earlier ones (where, levels) ride along in requestState until setup has everything.

Files: `packages/concepts-mcp/src/server.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

