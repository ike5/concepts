# Ordering commits by history position

_algorithm · intermediate_

git rev-list --count \<sha\> counts the commits reachable from a commit. A commit always counts higher than every ancestor, so the number orders commits by history even when timestamps tie, are rebased or come from skewed clocks.

**Learn first:** git rev-list and show

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

Several commits a day had sorted by random hash; the count now prefixes folders and orders the index.

Files: `packages/concepts-mcp/src/git.js:commitSeq`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

