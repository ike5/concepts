# Raw-mode terminal input

_language feature · intermediate_

A terminal normally buffers input until Enter. setRawMode(true) delivers each key immediately, and readline.emitKeypressEvents turns byte sequences like ESC \[ B into named keys such as 'down'. Raw mode must be switched off again, even on Ctrl-C.

**Learn first:** TTY detection

**Learn more:**

- [Node.js docs: readline.emitKeypressEvents](<https://nodejs.org/api/readline.html#readlineemitkeypresseventsstream-interface>)

## Where it showed up (1)

### 2026-11-12 · [Choosing how much each commit saves, and where](../commits/2026-11-12-4cc790e-choosing-how-much-each-commit-saves-and-where/README.md) · `4cc790e`

The arrow-key pickers need single keypresses without adding a prompt library.

Files: `packages/concepts-mcp/src/picker.js:run`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

