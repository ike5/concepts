# Cross-platform path separators

_language feature · beginner_

Windows separates path parts with \\ and macOS/Linux with /. Node's path module uses the current platform's separator (path.sep), so the same code produces different strings on each OS. Paths shown to people or compared in tests are often normalized to / first.

**Learn more:**

- [Node.js docs: path.sep and path.posix](<https://nodejs.org/api/path.html#pathsep>)

## Where it showed up (1)

### 2026-11-12 · [Showing folders the way people read them](../commits/2026-11-12-9143fca-showing-folders-the-way-people-read-them/README.md) · `9143fca`

Project folders are now shown as repo-relative paths joined with /, so messages read the same everywhere and the Windows CI jobs pass.

Files: `packages/concepts-mcp/src/core.js:shownDir`, `packages/concepts-mcp/src/config.js:outputDirInRepo`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

