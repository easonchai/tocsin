# Website source of truth

Edit `site/index.html` for landing content and metadata, `site/style.css` for layout,
`site/landing.js` for the hero trace, and `site/trust.js` for the trust-list tour.
Brand tokens, marks, ring field and scenes live in `design/kit/`; captures live in
`design/screens/` and fonts in `site/fonts/`.

`dapp/packages/nextjs/scripts/sync-site.mjs` generates the Next landing payload,
styles and public assets before dev, start, build, lint, tests and typecheck.
Generated files are ignored: do not edit or commit them. The tiny Next page
renders trusted repository HTML and maps demo/claim links to local routes.
React mounts the same vanilla behavior used by the static site and cleans it up
when leaving the page. Only the generated scenes script omits kit-sheet auto-init,
so React owns scene timers and observers.

`site/build.sh` builds the static IPFS site from those same sources. `/claim` and
`/demo` remain application routes; their app logic is separate from landing copy.
