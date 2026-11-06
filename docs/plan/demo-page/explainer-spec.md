# Demo page v2: pick a scenario, watch the explainer, then the wallet

Status: ready-for-agent. Written 6 Nov 2026 on main, revised the same evening after an adversarial pass. Builds on `docs/plan/demo-page/spec.md` (feat/demo), which stays the source for the scenario table, the swap decoder, the pool and the seeding. This spec changes what the page looks like and adds one job: before the wallet speaks, the page shows why it is about to say what it says.

Mock: `design/kit/demo-page.html`, served from the repo root (`python3 -m http.server 8732`, then `/design/kit/demo-page.html`). Stills in `design/screens/demo-page-cards.png` (the grid), `demo-page-final.png` (a card in focus with the stage, a block), `demo-page-warn.png`, `demo-page-poison.png`. The mock is the layout, the interaction and the motion; its data is hand-typed and the real page takes it from the constants.

Where it lives: one Next.js app, TypeScript, deployed on Vercel. The landing page (`site/index.html` today) becomes `/`, this page becomes `/demo`, the claim page becomes `/claim`. One header with the bell and the wordmark across all three. Ticket 05 below ports the landing page; the static `site/` folder stays as the IPFS build until the app replaces it.

## Problem

The board on feat/demo works but it is a table of buttons with DaisyUI badges. On stage the audience sees a row, a click, and a MetaMask popup. They do not see the thing that makes Tocsin different: several named writers put a flag in a log nobody can edit, the wallet follows lists it chose, and a rule turns those flags into a verdict. Right now the presenter explains that with words while the popup is already open. The page should show it first, with motion, in the brand, and then hand off to the wallet.

## Solution

A grid of scenario cards. Each card is a small explainer on its own: a title, one sentence, and a row of pills: the action (icon + "send eth", "send token", "approve", "swap"), the category with its glyph, and the expected verdict (✓ Pass in green, ! Warn in amber, ✕ Block in red, ? Unverifiable in amber). The lists are not on the card; the stage names them. Category links above the grid (All, Send ETH, Send token, Approve, Swap) filter the cards; plain underlined labels, All by default because ten cards fit in three rows.

Clicking a card lifts it: it flies to the top centre (FLIP, 420 ms), the other cards go, "← All scenarios" sits on its left, "↑ Previous" and "Next ↓" on its right, and the Send button appears under the card at once, with the poison RPC copy box or the snap-only note when the scenario needs one. The stage appears under all of that. Everything fits in one 1440 by 900 viewport, so the presenter never scrolls. Esc or the back button restores the grid.

The explainer and the Send are independent. The presenter talks over the animation and clicks Send whenever the story is told, which may be before the stage finishes. Nothing on the stage is a call to action. The stage plays under five seconds: the subject lands, the lists rise on the left, every writer that flagged it draws a wire to the subject with a dot travelling along it and says what it flagged, the proof flow on the right shows how the wallet knows (header, proven head, events, replayed head, compare), a counter collapses writers that share an operator, the rule sentence explains the outcome, the verdict word lands with one ripple, and the Send button appears. The presenter clicks Send and the wallet, which is not mocked anywhere on the page, opens and says the same thing.

Why cards and not a chip strip or a rail. A chip is a label; a card has room to say what the thing is before the stage has to. The audience reads the card while the presenter talks, then watches the stage prove it. Why no wallet mock: the real popup is the proof and anything that imitates it on the page would weaken that. The stage ends on the verdict and the Send button, nothing else.

The page still checks nothing. Every fact on the stage comes from the scenario constants, which the existing test pins to the demo address table. The stage is the presenter's prediction, drawn. The wallet is the proof.

## The lists on stage

The wallet follows our own names, so the stage shows them:

| Name | Role line on stage | Writers | Weight |
| --- | --- | --- | --- |
| `core.tocsin.eth` | us: the core writer and the detector agent, one operator | core, detector | 255, 1 |
| `blockaid.tocsin.eth` | a security vendor, claimed by the owner of blockaid.eth | blockaid | 255 |
| `scamsniffer.tocsin.eth` | phishing researchers, claimed by the owner of scamsniffer.eth | scamsniffer | 1 |

The role line exists because nobody in the room knows who these names are, and "two or more people saying this" only lands if they read as people. `detector.tocsin.eth` is not a list on stage; it is the detector writer inside the core list.

Data dependency, the one thing not on chain yet: the blockaid and scamsniffer keys hold names but have no leaves in the log and no `tocsin.list` record on their names. Ticket 10 seeds them. Until then the stage can only draw core.tocsin.eth flags, which is enough for the clean, warn-only, retracted and single-writer block scenes but not for "two or more people".

## What the audience sees, in order

1. Presenter clicks "Drainer receiver" in the chip strip. The stage clears in one cross-fade.
2. The subject pill lands in the centre: the context label above it (`recipient of your send`, `spender of your allowance`, `the token contract you are calling`), the label `drainer-receiver-1`, the address in mono, the category.
3. The three lists rise on the left, staggered 120 ms, each with its role line and its writer pills with weights.
4. For each writer that flagged the subject, a hairline draws from the list card's edge to the subject, 400 ms, with a dot travelling along it from then on. A weight-255 writer's line is heavier. Next to the writer pill two pills appear: the category with its glyph, and the evidence hash with a link icon. One writer every 480 ms.
5. The counter under the subject, in display numerals: "3 independent writers · 3/3 lists". When the core writer and the detector both flagged, it adds "core + detector count once".
6. The rule sentence, one of a fixed set (below).
7. The verdict word: Clean in paper, Warn in paper with an amber underline, Blocked in alert red, Unverifiable in amber. One ripple runs out from the word. On Blocked, and only then, the subject card takes a red outline and the dots on the wires turn red. Red appears nowhere else on the page.
8. The stage ends on the verdict word. The caption "The wallet should say this. The stage is drawn from the seed table; the wallet checks the chain itself" sits under the Send button in the focus row, not on the stage.
9. Presenter clicks Send. The real wallet opens and agrees. Nothing on the page imitates it.

The proof flow on the right runs alongside steps 3 to 6, top to bottom, four nodes with an icon each and a dot dropping along each link: "block header · finalized / light client, not an RPC" (paper hero node) → "proven head, core.tocsin.eth / 0x8f3a…c41e" → "events from the RPC / 1 2 3 4 5 6 7 8" → "replayed head · keccak(head, flag) / 0x8f3a…c41e" → "= match". In the lying-RPC scene the events node shows `? 2 3 4 5 6 7 8`, the last link's dot stops short and turns red, the replayed head differs and turns red, and the compare reads "✕ mismatch". Same four nodes every time, so by the third scenario the audience reads it without help.

Words are kept to the minimum that still explains. Each writer's line is two pills (category glyph, evidence hash with a link icon), not a sentence. List roles are two words ("us", "security vendor", "phishing researchers"). The rule sentence is the only full sentence on the stage, and it is one line.

Whole explainer under five seconds. Click anywhere on the stage to jump to the final frame. `R` replays. Left and right arrows move through the chips in order, which is the run of show. `Enter` skips to the end, then sends.

## Rule sentences

Fixed strings, chosen by `explain()`, in this order of precedence:

- lying RPC: "The RPC left out one of the writer's entries. The replayed fold does not reach the head Ethereum proves. Nothing it says can be trusted, so the wallet refuses to call this clean."
- retracted: "The writer retracted its own flag with a tombstone. The log keeps both entries; the wallet counts neither."
- nothing flagged: "No list you follow has a flag on this address."
- warn-only category: "A weight-255 writer would block, but this category warns and never blocks a send: the money is already stolen, the wallet only tells you where it is going."
- block by weight: "<lists> carry this writer at weight 255. One such writer blocks on its own."
- block by count: "Two independent writers on one list reach the threshold. That blocks."
- warn, several lists: "Each list has one writer at weight 1. One writer warns. Two lists do not add up to a block."
- warn, one list: "One writer at weight 1 warns." The scamsniffer-only row appends "Set the Snap policy to 1 writer and this blocks."

## Scenes

| Shape | Trigger | What is different on stage |
| --- | --- | --- |
| clean | no flags | lists rise, no lines, no ripple, Send button in paper |
| block by weight | a flagging writer at 255 in a blocking list | heavier line |
| block by count | two independent weight-1 writers on one list | the counter is the beat |
| warn | flags but no list reaches block | rule says why not |
| warn-only category | THEFT_PROCEEDS | the cap is said out loud |
| retracted | a TOMBSTONE on the flag | line draws, then dashes out, the caption is struck through and gains "then retracted it", verdict Clean |
| token context | subject is the token contract (fakeUSDC) | context label `token`, subject reads "fakeUSDC, the contract itself", `snap only` tag on the chip |
| spender context | approve rows | context label `spender` |
| swap recipient | swap rows | a second, dark pill for the router above the subject, with "the decoder reads through the swap to its recipient" |
| unverifiable | the lying-RPC scenario (drainer-receiver-4, which only core flags; drainer-receiver-1 still blocks through blockaid) | before any flag draws, a sequence strip `90 91 92 ? 94 95 96` appears under core.tocsin.eth with `93` missing in red; the core writer's line says sequence 93 is missing and the replayed head does not match; verdict Unverifiable; no flags are drawn because the wallet refuses the data; the final frame carries the poison RPC with a copy button and "paste into the Snap RPC setting first" |

The lying RPC is its own chip ("Drainer receiver, lying RPC", tagged beat 2), not a toggle. A toggle would change the stage while the wallet keeps using whatever RPC is pasted, which is a lie on stage. The chip's final frame holds the copy box so the presenter pastes before pressing Send.

There are no policy preview chips, for the same reason. The scamsniffer-only explainer says what threshold 1 would do; the presenter flips the Snap.

## Layout

Desktop, 1440 and 1920 wide. Below 1200 the chips wrap further and the stage stacks the lists above the subject; it only has to not break.

- Header: wordmark, `demo · sepolia` label, the connect button showing account and host ("MetaMask + Tocsin Snap" or "Kohaku"), Install Snap. Debug Contracts and Block Explorer go into an overflow menu.
- Header: the bell emoji, then the wordmark, on every page of the app, matching the landing page.
- Category links: mono uppercase, underlined, All first. They filter the grid and nothing else.
- Cards: four columns, `ink-800` with the hairline, title at 17/600, one sentence at 14 in `paper-200`, then the pill row. Pills are mono uppercase 11px in rounded outlines: the action pill is filled `ink-900` with a glyph (→ ◇ ✓ ⇄); the category pill is dashed and grey with its glyph (⤓ drainer, ≈ poisoning, $ theft proceeds, ≠ lookalike, ◇ fake token); "retracted" is struck through; the verdict pill is bold, ✓ Pass in green (#4fbf7a on a 12% tint, the only green on the page, by Eason's call on 6 Nov), ! Warn in amber on a 12% amber tint, ✕ Block in red on a 12% red tint, ? Unverifiable in amber. An amber mono tag in the title row when needed: `beat 2`, `snap only`. Button and link text is sentence case; pills and labels are the mono uppercase style.
- Focus row: "← All scenarios" left, the lifted card centred at up to 640px with the Send button and its notes directly under it, "↑ Previous" and "Next ↓" right.
- Stage: `ink-800` panel, hairline border, three columns 28 / 1fr / 26 with a 56px gap so the wires have room. Lists left, subject and verdict middle, the proof flow right. Hidden until a card is chosen. No button on the stage.
- Send button is the only amber element on the page, and only when the verdict is Warn or Blocked. Clean takes paper. Unverifiable takes paper too, because the verdict word already took the amber.
- Cards Kohaku cannot catch carry the `snap only` tag; when the connected host is Kohaku their Send is disabled with the reason under it.
- Presenter mode on `P`: hides the header, scales stage type 1.25.

## Visual rules (from `design/DIRECTION.md`)

- Tokens from `design/kit/tokens.css`. Inter for text, JetBrains Mono for names, addresses, weights, evidence, the sequence strip and the handoff caption. No DaisyUI classes remain in the body.
- Entrances 240 ms ease-out with a 12 px rise. Lists stagger 120 ms. Lines draw with `stroke-dashoffset` over 400 ms. Writers 480 ms apart. Rule 650 ms before the verdict. Cross-fade 700 ms.
- Nothing bounces, nothing scales from zero. The only loop on the page is the background dot field, which does not strike ambiently here; it strikes once, at the verdict.
- `prefers-reduced-motion`: final frame with every caption visible, no ripple.
- Wires are SVG paths; each gets a 3.5px dot travelling it on `animateMotion`, 1.6 s loop. Proof links get a dot dropping along them. Dots are `paper-200` until a Blocked verdict turns them `alert`.
- Red is `alert` and appears only on a verdict: the Block pill on a card, and on the stage the word Blocked, the subject outline, the category pill on the subject, the dots, and in the lying-RPC scene the missing sequence, the replayed head and the compare line. Amber on a card is the Warn or Unverifiable pill, green is the Pass pill and nothing else. On the stage, Clean stays paper.

## Data

The scenario table in `dapp/packages/nextjs/utils/demo/scenarios.ts` stays the source. Additions, all constants, all covered by the tsv test:

```ts
export type Writer = { id: string; label: string; weight: 1 | 255 };
export type List = { name: `${string}.tocsin.eth`; role: string; blocking: boolean; writers: Writer[] };
export type Flag = { writer: Writer["id"]; evidence: Hex; tombstoned?: boolean };
// per scenario
context: "recipient" | "spender" | "token";
flags: Flag[];
poison?: true;
via?: { label: string; address: Address };   // swap rows: the router
```

`LISTS` is built from the two list documents in `docs/plan/demo/seed/` plus the two to come from ticket 10, and evidence hashes from the curators manifest.

`explain(scenario, policy): Scene` in `utils/demo/explain.ts` is a pure function returning the per-list outcome, the independent-writer count, the rule sentence and the verdict. It mirrors the reader's rules (independent writers, operator collapse, weight 255, warn-only cap, tombstone, OR across lists) and says in a comment that it is presentation code. The test that matters: for every scenario, `explain(s).verdict === s.expected` under the default policy. That ties the drawing to the table, and the table to the chain.

## Wallet handoff

Unchanged path: `buildTx` then wagmi `sendTransaction`. The stage's Send button is that call. Rejection (4001) and other errors print in plain words under the button, as the current page does. The header reads the connector name so the presenter knows which host will answer.

## Tickets

- 05 One app. The landing page from `site/index.html` ported into the Next.js package as `/`, the claim page as `/claim`, this page at `/demo`, shared header with the bell and wordmark, tokens and fonts from `design/kit`, deployed on Vercel with the Sepolia RPC override the current page already has. The app must stay a static export: no API routes, no request-time server components, no middleware, no Next image optimisation, `generateStaticParams` on every dynamic route, Helios and other WASM lazy-loaded so `/` stays light. `NEXT_PUBLIC_IPFS_BUILD=true yarn build` (the scaffold's `yarn ipfs`) is what goes behind tocsin.eth on eth.limo; Vercel serves the same code at tocsin-eth.vercel.app. The static `site/` build keeps working for IPFS until the app replaces it. Acceptance: the three routes render on the Vercel preview with the kit fonts; the landing page's dot field and scenes still run; `yarn ipfs` builds without errors and the exported folder opens from an IPFS gateway with the demo working.
- 06 Kit port and the stage skeleton. Tokens and fonts into the Next.js package, DaisyUI out of the body, header, category links and the card grid from the scenario table (each row gains a `desc`), the lift-to-focus interaction with back, previous and next, the Send button under the lifted card, stage with the three columns, the lists rendered from `LISTS`, the subject from the scenario, the proof flow's four nodes, the Send button wired to `buildTx`. No motion yet: the final frame renders at once. Acceptance: 1440 screenshots match `design/screens/demo-page-cards.png` and `demo-page-final.png` in structure; the focused state fits in 1440 by 900 with no scroll; connect, Install Snap and Send work on Sepolia.
- 07 The explainer. `explain.ts` with its test. The timed sequence from "What the audience sees" for clean, warn, block by weight and block by count, with the wires and their dots, the writer captions, the proof flow and its dropping dots, the counter, the ripple, the red at Blocked, skip on click, replay, arrow keys, reduced motion. Acceptance: every Send ETH row plays under five seconds and ends on the same frame ticket 06 renders.
- 08 The variants. Warn-only, retracted, token, spender, swap recipient, and the lying-RPC scene with the sequence strip and the copy box. Acceptance: each has a chip and plays; the explain test covers all of them.
- 09 Handoff polish. Host-aware Send (Kohaku disables snap-only cards), presenter mode, the strike into the background field at the verdict, keyboard flow (arrows move between scenarios in focus, Esc back, R replay, Enter skip). Acceptance: the runbook's three beats run from the keyboard with the mouse used only for Send and the wallet.
- 10 Seed the two claimed names. Append flags from the blockaid and scamsniffer keys for the subjects the scenario table expects of them (drainer-receiver-1 at least from both, the scamsniffer-only operator, the shared poisoning operator), publish `tocsin.list` on `blockaid.tocsin.eth` and `scamsniffer.tocsin.eth` signed by their own keys through `setup-all.mjs`'s `publishList`, and point the reader's followed lists at the three `.tocsin.eth` names. Acceptance: the tsv test passes against the new leaves; the Snap blocks drainer-receiver-1 with three lists named.

## Out of scope

- Any live read of the log, the lists or ENS on the page.
- Changing the reader's policy or the Snap from the page.
- Mobile layout beyond not breaking.
- Sound.
- Explaining the light client beyond the one unverifiable scene. The landing page and the deck carry that.

## Notes for whoever builds it

- Lift the pill, connector and stagger patterns from `design/kit/scenes.js` and `scenes.css`; the mock in `demo-page.html` already has a working `wire()` that anchors at the list card's right edge, curves to the subject's centre, and attaches the travelling dot.
- `dapp/packages/reader/src/evaluate.ts` is the reference for the rule sentences. Keep `explain.ts` in step with it by hand; they are not shared code on purpose, because the page must never be the thing that decides.
- The real wallet popup will cover part of the proof flow after Send. That is fine: the flow has already played, and the verdict and rule sentence sit in the middle column where the popup does not reach.
