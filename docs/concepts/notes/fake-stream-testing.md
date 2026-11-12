# Testing with fake streams

_testing · intermediate_

Code that reads from stdin and writes to stdout can take the streams as parameters; tests pass in-memory PassThrough streams and write key sequences into them.

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

The picker tests type arrow keys, digits, Space and Enter into a PassThrough instead of needing a real terminal.

Files: `packages/concepts-mcp/test/levels.test.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

