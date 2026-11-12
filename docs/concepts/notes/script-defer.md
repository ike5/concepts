# Deferred scripts

_language feature · beginner_

A \<script defer\> downloads in parallel with parsing and runs after the HTML is parsed, in order. It doesn't block rendering and can safely query the finished DOM.

**Learn more:**

- [MDN: script defer](<https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#defer>)

## Where it showed up (1)

### 2026-11-05 · [A redesigned site with a live library page](../commits/2026-11-05-5850870-a-redesigned-site-with-a-live-library-page/README.md) · `5850870`

library.js needs the grid and the existing cards to be in the DOM before it looks for them.

Files: `docs/library.html`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

