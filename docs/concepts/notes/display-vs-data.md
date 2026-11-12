# Display values vs data values

_pattern · beginner_

Keep the precise value for programs (an absolute path) and derive a separate, friendlier form for people (docs/concepts, ~/ConceptLibrary). Formatting for display shouldn't change the data other code relies on.

## Where it showed up (2)

### 2026-11-12 · [Shorter setup with any typed folder](../commits/2026-11-12-1508c11-shorter-setup-with-any-typed-folder/README.md) · `1508c11`

Absolute repo paths are stored repo-relative and home paths as ~/..., so the committed config is portable.

### 2026-11-12 · [Showing folders the way people read them](../commits/2026-11-12-9143fca-showing-folders-the-way-people-read-them/README.md) · `9143fca`

The structured result still carries absolute paths; only the messages use the shown form.

Files: `packages/concepts-mcp/src/server.js:setupSummary`, `packages/concepts-mcp/src/cli.js:printSaved`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

