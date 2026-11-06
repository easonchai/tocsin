# Tocsin design handoff

This folder is everything a designer needs to pick up Tocsin: what it is, why it exists, the brand direction we settled on, the code kit that already implements it, and what we still want designed. Read this file, then `DIRECTION.md`, then open the kit in a browser.

## What Tocsin is, in plain words

Every crypto wallet asks a company whether an address is safe before you send money to it. Explorer labels, phishing databases, simulation vendors: each one holds a private list, serves it from an API, and sees every address you ask about. If that API lies, or is down, or is bought, the wallet has no way to know.

Tocsin is a public, append-only log of scam infrastructure on Ethereum itself. Anyone can write a flag into their own namespace. Nothing is ever deleted. A wallet does not trust the writers by default; it follows trust lists it chooses, signed by named maintainers, and it checks the log against Ethereum's own state using a light client. So when an RPC says "clean" and the chain says "flagged", the wallet catches the lie on the device, without telling anyone which address it checked.

The name: a tocsin is the bell a town rings when something is coming. One strike, heard by everyone, and each household decides what to do.

## Why we are doing this

- We are building it at Devcon 8 and ETHGlobal Mumbai, 5 to 7 November 2026. Submissions close 8 November, 09:00 IST.
- The log format and the reader rules are written up as a spec, so any wallet can implement the same reader. The spec is in `docs/spec/threat-flag-log.md`.
- The audience is Ethereum developers, wallet teams, and hackathon judges. The pitch in one line: your wallet checked Ethereum itself and caught the lie.
- The second idea, which the brand carries in motion rather than in words: one flag reaches every wallet that syncs. The bell, not the list.

## The one memory

Everything on screen serves one sentence: **your wallet checked Ethereum itself and caught the lie.** The type and the wallet screens carry that. The background and the animations carry the second idea, the bell reaching everyone. If a design choice does not serve one of those two, it goes.

## What is decided

Read `DIRECTION.md` for the full rules. The short version:

- Dark greyscale with one warm amber. Amber is the strike and appears once per screen. Red appears only on a "Blocked" verdict. No green: clean is the absence of red.
- Still until touched. Nothing bounces. The background field, three schematics and pausable trust-list walkthrough carry the motion.
- The mark is a bell drawn as its sound: three nested bell curves on one lip, with a strike dot. Eason chose it from the explorations in `explorations/marks-a.html` (option A2). The curve profile is a cast bell, not a Gaussian; the construction is recorded in `HANDOFF.md` at the repo root.
- The wordmark is "tocsin", lowercase, Inter 700, tracking -0.03em. Lowercase because a bell is a common thing.
- Fonts: Inter for display and body, JetBrains Mono for anything that is data. Both bundled under `site/fonts/` as variable fonts, both OFL. Changed from Bricolage Grotesque and Schibsted Grotesk on 6 Nov 2026 for legibility on a projector.
- The background is a still dot field. A strike sends three rings outward; dots the ring passed stay faintly brighter, so the field remembers where it was struck. The cursor carries a soft lens. Copy is always masked so text wins.
- The product screens follow the Devcon schematic language: hairline connectors, mono pills on dark panels, one solid paper hero node.

Reference sites we dissected before deciding: ens.domains (we refused its hue cycling), devcon.ens.domains (we took "the background is the system's state"), railgun.org (we took the stillness and the cursor lens).

## What exists, and how to look at it

Serve the repo root and open the pages. Fonts resolve from `/site/fonts/`, so a file:// open will fall back to system fonts.

```
cd <repo>
python3 -m http.server 8732
```

| Page | What it shows |
| --- | --- |
| `design/kit/index.html` | The kit sheet: palette, type, mark at every size, the live background with its five states, motion rules, the avoid list |
| `design/kit/scenes.html` | The three how-it-works loops: writers appending, the wallet proving and replaying, the lying RPC caught |
| `design/kit/snap.html` | The MetaMask Snap, every state, in MetaMask's own theme; built from `docs/plan/demo/snap-ui.md` |
| `design/kit/mocks.html` | Tocsin inside three wallets: a Kohaku send screen, a MetaMask Snap panel, a browser-extension overlay |
| `design/kit/cover.html` | The 16:9 cover and OG source; `screens/cover-1280x720.png` and `screens/logo-512.png` are rendered from `cover.html` and `icon.html` |
| `design/explorations/marks-a.html` | The mark explorations A1, A2, A3; A2 is the one |
| `design/explorations/marks.html` | The earlier round: ring, strike, toll |
| `site/index.html` | The landing page, built on the kit; the trace in the hero drives the background |

Files in `kit/`:

- `tokens.css` is the only place colours, type, and motion durations live. Everything else imports it.
- `mark.svg` on dark, `mark-light.svg` on paper, `favicon.svg` with two curves at stroke 2.2, `icon.svg` at 512 with radius 112.
- `ringfield.js` is the background. `scenes.js` and `scenes.css` are the three loops. Both are plain JavaScript with no dependencies.
- `index.html`, `scenes.html`, `mocks.html` are the sheets above.

`screens/` has stills of each page in case you want to look before running anything.

## What we want designed

In order of value to the hackathon pitch:

1. **The mark, finished.** A2 is chosen but it has only been drawn in code. Refine the curve weights, the lip, the strike dot, and the optical centring at 16, 32, 96, 512. Deliver SVG. Keep the three-curve bell idea and the square caps.
2. **A hero still and an OG image.** One frame that says "the wallet caught the lie": the trace ending in Blocked, the amber word, the field with one struck region. 1200 by 630 for the social card, plus a 16:9 for the pitch deck title.
3. **The three wallet screens, polished.** `mocks.html` has the content and the hierarchy. Make them look like the real hosts (Kohaku is an Ambire fork; the Snap lives inside MetaMask's confirmation; the extension overlays any dapp) while keeping the Tocsin block the only thing with a voice.
4. **The pitch deck frames.** Eight to ten slides on the kit: title, the problem (wallets trust companies), the idea (a dumb log, chosen lists, one proof), the demo beat (honest RPC blocks, lying RPC caught, mirror restores), the spec, the ask.
5. **Motion polish on the three scenes.** They are built and loop under ten seconds. If you see a better beat for any of them, sketch it; we will rebuild from your storyboard.

Not wanted: shields, locks, eyes, radar sweeps, node graphs with glowing edges, purple, gradients as texture, grain, a bell with a notification badge, any AI-generated imagery until Eason has approved the direction you propose.

## Current landing page and upload assets

The November 6 landing refinement preserves the original low-set hero, floating terminal, three-column sections, fine rules and continuous dot field. It adds sourced incident figures, the compromised-provider threat model, opaque animation canvases, a clear trust-list policy, local-check privacy, and Kohaku / Anon-RPC integration status. Solid dark backgrounds are limited to the problem and privacy sections; there is no light color band or stacked-card redesign. The CTAs target the planned `https://tocsin-eth.vercel.app/demo` route; the demo deployment is being handled separately.

The trust-list section pairs three selectable steps with simple coded diagrams: a name resolves to a list, a pinned signer checks updates, and independent reports combine into a verdict. It advances every nine seconds, with a thin amber progress line. Clicking a step resets its timer and continues playback; keyboard navigation, the pause button and leaving the viewport stop it. Reduced-motion visitors start in manual mode with completed diagrams. On phones, the steps become compact tabs above the example.

- `screens/cover-1280x720.png`: refreshed 1280×720 cover, also copied by `site/build.sh` to `dist/og.png`.
- `screens/showcase-01.png` through `showcase-06.png`: refreshed 1600×1000 gallery boards. Source: `kit/showcase.html?b=1` through `?b=6`.
- `screens/landing-hero.png`: current desktop landing-page capture.
- `screens/logo-512.png`: existing finished icon, unchanged.
- The Snap captures and `screens/demo-page-final.png` remain example UI. The gallery labels those examples; they are not evidence of a live hosted demo or external publisher participation.

To export the cover, serve the repo root, load `kit/cover.html` at 1280×720, wait for local fonts, and capture `#cover`. For gallery boards, use a 1600×1000 viewport and capture `.board.on`. Reduced-motion mode provides a stable dot field. The build copies these PNGs; it does not regenerate them.

## Who decides

Eason owns the direction and signs off on everything. Ask early, show rough work, and keep the one memory in view.
