# Redrawing with ANSI escape codes

_tooling · intermediate_

Escape sequences such as ESC\[3A (cursor up 3 lines) and ESC\[J (clear to end of screen) let a program redraw part of the terminal in place. It only works if you know exactly how many rows you drew, so lines must never wrap.

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

Each keypress redraws the picker in place, and rows are trimmed to the terminal width so a wrapped line can't break the redraw.

Files: `packages/concepts-mcp/src/picker.js:row`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

