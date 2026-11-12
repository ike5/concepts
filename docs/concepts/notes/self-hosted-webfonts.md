# Self-hosted web fonts

_performance · intermediate_

Serving fonts from your own site with @font-face instead of a font CDN: no third-party requests, no tracking, and it works offline. WOFF2 is the compressed format browsers prefer; font-display: swap shows fallback text until the font loads.

**Learn more:**

- [web.dev: Best practices for fonts](<https://web.dev/articles/font-best-practices>)

## Where it showed up (1)

### 2026-11-05 · [A redesigned site with a live library page](../commits/2026-11-05-5850870-a-redesigned-site-with-a-live-library-page/README.md) · `5850870`

The site loads Manrope, DM Sans and DM Mono from docs/assets/fonts with font-display: swap, keeping visitors' requests on GitHub Pages.

Files: `docs/assets/site.css:1-4`

## My notes

<!-- Your own notes below this line are kept when this file is regenerated. -->

