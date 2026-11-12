# Capability negotiation

_protocol · intermediate_

At connection (or per request) the client declares which optional features it supports. A server checks those capabilities before using a feature, rather than finding out from an error.

**Learn first:** Model Context Protocol

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

The server reads the client's elicitation capability (from the request envelope or the initialize handshake) to decide between a form and the fallback.

Files: `packages/concepts-mcp/src/server.js:canElicit`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

