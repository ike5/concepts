# Resolving symlinks before comparing paths

_concept · intermediate_

Two different strings can name the same folder when a symlink is involved (on macOS /var is a link to /private/var). Comparing paths safely means resolving both with realpath first. For paths that don't exist yet, resolve the deepest existing ancestor and re-append the rest.

## Where it showed up (1)

### 2026-11-12 · [Shorter setup with any typed folder](../commits/2026-11-12-1508c11-shorter-setup-with-any-typed-folder/README.md) · `1508c11`

Absolute folders typed inside a temp repo looked like they were outside it until both sides were resolved.

Files: `packages/concepts-mcp/src/core.js`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

