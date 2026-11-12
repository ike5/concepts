# Shell glob expansion

_tooling · beginner_

In a Unix shell, an unquoted pattern like test/\*.test.js is replaced by the matching file names before the program runs. Quoting it passes the pattern through unchanged, and then the program itself has to understand globs.

**Learn more:**

- [Bash manual: Filename expansion](<https://www.gnu.org/software/bash/manual/html_node/Filename-Expansion.html>)

## Where it showed up (1)

### 2026-11-05 · [Listing test files so Node 20 finds them](../commits/2026-11-05-f1ad098-listing-test-files-so-node-20-finds-them/README.md) · `f1ad098`

The quotes were there so Node's runner would expand the glob, which only Node 21+ does.

Files: `packages/concepts-mcp/package.json:16`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

