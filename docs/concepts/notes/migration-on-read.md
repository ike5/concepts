# Schema migration on read

_pattern · intermediate_

Version the stored format and convert old versions to the new shape as they're read, writing the new version only when something changes. Old files keep working without a migration step.

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

A version 1 .concepts.json becomes one destination that keeps writing every file, so upgrading changes nothing until settings change.

Files: `packages/concepts-mcp/src/config.js:readSharedConfig`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

