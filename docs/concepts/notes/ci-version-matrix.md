# CI version matrix

_testing · beginner_

Running the same CI job on several runtime versions at once, so a feature missing from the oldest supported version breaks the build instead of a user's install.

## Where it showed up (1)

### 2026-11-05 · [Listing test files so Node 20 finds them](../commits/2026-11-05-f1ad098-listing-test-files-so-node-20-finds-them/README.md) · `f1ad098`

The Node 20 jobs in the matrix were what caught that the tests silently never ran there.

Files: `.github/workflows/ci.yml`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

