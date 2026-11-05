# Tocsin brand direction

The one memory: your wallet checked Ethereum itself and caught the lie. The screens and the type carry that. The background and the animations carry the second idea, that one wallet bitten immunizes every wallet that syncs, a bell that reaches everyone.

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

| State | Dots | Ring |
| --- | --- | --- |
| idle | `ink-700` | none |
| syncing | `ink-400` | `signal` at 30% |
| verified | `paper-100` fading to `ink-400` | `signal` |
| unverifiable | `ink-700` | `alert` at 40%, ring stops halfway |
| blocked | `ink-700` | `alert`, one strike, no spread |

## Type

Bricolage Grotesque for display, 700, tight tracking. Schibsted Grotesk for body. JetBrains Mono for anything that is data: addresses, sequence numbers, labels, the trace. All three are already bundled in the site and licensed under the OFL.

Display runs large and few. One sentence per section at most. Mono labels are 12px uppercase with wide tracking and sit in `ink-400`.

## The mark

A bell seen as its sound. Three concentric arcs rising from a strike point, open at the bottom, closed by a short lip. Read quickly it is a bell; read slowly it is a signal radiating outward. It works at 16px as a favicon because the arcs survive and the lip reads as a base.

The wordmark is "tocsin" in lowercase Bricolage 700, tracking -0.03em. Lowercase because a bell is a common thing, not a brand shouting.

## The background

A field of small dots on `ink-900`, on a 24px grid. Still. Every eight to twelve seconds a strike lands somewhere in the field and three rings propagate outward; a dot lights to `paper-100` as the ring passes and settles to `ink-400`, so struck regions stay faintly brighter. The field remembers. That is herd immunity drawn without a single node-graph line.

Rules, taken from Devcon and Railgun:

- Deterministic. The strike sequence comes from a seed, so two visitors see the same field and screenshots are reproducible.
- Still until touched. A click or tap is a strike at the cursor. The cursor carries a soft lens, after Railgun: dots within about 170px brighten and bloom, and the lens eases behind the pointer rather than snapping to it.
- The state recolours the rings, never the page.
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
