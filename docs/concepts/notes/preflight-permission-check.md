# Checking write access up front

_concept · intermediate_

fs.access with W\_OK on the nearest existing ancestor tells you whether a folder could be created and written, before any files are touched. It's advisory (permissions can change), so the real write still handles errors.

## Where it showed up (1)

### 2026-11-12 · [Shorter setup with any typed folder](../commits/2026-11-12-1508c11-shorter-setup-with-any-typed-folder/README.md) · `1508c11`

Setup refuses folders it couldn't write to and says so, instead of failing halfway through writing.

Files: `packages/concepts-mcp/src/core.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

