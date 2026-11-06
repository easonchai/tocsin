# Tocsin brand direction

The one memory: your wallet checked Ethereum itself and caught the lie. The screens and the type carry that. The background and the animations carry the second idea, that one flag reaches every wallet that syncs, a bell that reaches everyone.

## What a tocsin is

A tocsin is the bell a town rings when something is coming. It is not an accusation and it is not a siren. It is one strike, heard by everyone at once, that lets each household decide what to do. That is the whole product in an object, and it fixes three choices at once: the mark is a bell reduced to its ring, the background is the ring reaching a field of wallets, and the accent is the colour of the strike, used once per screen.

## Where it sits against the references

ENS is bright, playful, and rotates through four hues. Railgun is charcoal, still until touched, with a halftone lens that follows the cursor. The Devcon ENS page has one idea worth taking whole: the background is the system's state. Grey while idle, pink while typing, green on success.

Tocsin takes Railgun's stillness and Devcon's state-as-background, and refuses ENS's hue cycling. One warm accent. Everything else is greyscale.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `ink-900` | `#121417` | Page |
| `ink-800` | `#1a1d22` | Surfaces, panels, the trace |
| `ink-700` | `#262a30` | Hairlines |
| `ink-600` | `#3a3f47` | Strong hairlines, borders on hover |
| `ink-400` | `#8f8b82` | Muted text, captions, idle dots |
| `paper-200` | `#c9c3b6` | Secondary text |
| `paper-100` | `#ece7dc` | Primary text, verified state |
| `signal` | `#e9a23b` | The strike. CTA, the one highlighted word, the proof path |
| `signal-deep` | `#b97615` | Pressed and hover on signal |
| `alert` | `#e5484d` | Blocked. Only ever on the verdict |

No green. Clean is the absence of red, not a colour.

The background's state palette, after Devcon:

| State | Dots | Wave |
| --- | --- | --- |
| idle | `ink-700` | `paper-200` |
| syncing | `ink-600` | `signal` |
| verified | `ink-600` | `signal` |
| unverifiable | `ink-700` | `alert`, stops halfway |
| blocked | `ink-700` | `alert`, one wave, no echoes |

## Type

Inter for display and body. Display is 700 with tight tracking, body is 400 and 500, buttons 600. One family, because the screens are read fast on a projector and in a wallet popup, and Inter stays legible at both ends. JetBrains Mono for anything that is data: addresses, sequence numbers, labels, the trace. Both are bundled in `site/fonts/` as variable fonts under the OFL.

Display runs large and few. One sentence per section at most. Mono labels are 12px uppercase with wide tracking and sit in `ink-400`.

## The mark

A bell seen as its sound. Three concentric arcs rising from a strike point, open at the bottom, closed by a short lip. Read quickly it is a bell; read slowly it is a signal radiating outward. It works at 16px as a favicon because the arcs survive and the lip reads as a base.

The wordmark is "tocsin" in lowercase Inter 700, tracking -0.03em. Lowercase because a bell is a common thing, not a brand shouting.

## The background

A field of small dots on `ink-900`, on a 24px grid. It is never quite still: two slow waves drift across it so every dot breathes between `ink-700` and `ink-600` in brightness and size, too slow to notice unless you look. Every eight to twelve seconds a strike lands somewhere in the field and a ripple moves outward through the dots. There is no drawn circle: the ripple is the dots themselves lighting and swelling at the crest, with two echoes behind it and a shallow trough between, to `paper-200` in idle and to the state's colour otherwise. It decelerates as it spreads and fades over about four seconds; the dots it passed stay a little brighter for ten seconds more, then let go. The field remembers briefly. That is herd immunity drawn without a single node-graph line.

Rules, taken from Devcon and Railgun:

- Deterministic. The strike sequence comes from a seed, so two visitors see the same field and screenshots are reproducible.
- Quiet until touched. A click or tap is a strike at the cursor. The cursor carries a soft lens, after Railgun: dots within about 170px brighten and bloom, and the lens eases behind the pointer rather than snapping to it.
- The state recolours the wave, never the page. A screen strikes once per event, never on load for its own sake; the landing page strikes only on the verdict.
- Text always wins. A blurred page-colour mask sits over the field wherever copy is, so dots never show through letters; the field lives in the margins, the gutters, and around the trace.
- Lit dots bloom with a soft glow instead of hardening into squares. Nothing in the field is ever brighter than paper-200.
- A frame-time watchdog turns ambient strikes off above 70ms median. Reduced-motion shows the settled field with no rings. Hidden tabs pause.
- No hue cycling, no pinned scroll sections, no particles.

## Diagrams

Devcon's schematic language in our palette: 1.5px `ink-600` connectors, mono pills on `ink-800`, one solid `paper-100` hero node per diagram, entrances staggered 0.4 seconds. Three scenes, each under 10 seconds, each loops: writers appending to their chains, the wallet proving a head and replaying, and the lying RPC caught by a chain mismatch. They double as the loading illustrations.

## Motion

- Entrances: 240ms, ease-out, 12px rise. Never more than three staggered elements.
- State changes: 700ms cross-fade, in the order the ring would reach them.
- The trace types at 420ms per line, 650ms before the verdict.
- Nothing bounces. Nothing scales from zero. Nothing loops on screen except the background and the diagrams.

## What to avoid

Shields, locks, eyes, radar sweeps, and any node graph with glowing edges. Purple. Gradients as texture. Grain. A bell with a notification badge.
