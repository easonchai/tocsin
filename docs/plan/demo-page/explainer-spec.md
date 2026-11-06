# Demo page v2: pick a scenario, watch the explainer, then the wallet

Status: ready-for-agent. Written 6 Nov 2026 on main. Builds on `docs/plan/demo-page/spec.md` (feat/demo), which stays the source for the scenario table, the RPC boxes, the swap decoder, the pool and the seeding. This spec changes what the page looks like and adds one job: before the wallet speaks, the page shows why it is about to say what it says.

## Problem

The board on feat/demo works but it is a table of buttons with DaisyUI badges. On stage the audience sees a row, a click, and a MetaMask popup. They do not see the thing that makes Tocsin different: several named writers put a flag in a log nobody can edit, the wallet follows lists it chose, and a rule turns those flags into a verdict. Right now the presenter explains that with words while the popup is already open. The page should show it first, with motion, in the brand, and then hand off to the wallet.

## Solution

One screen, three regions. A scenario rail on the left. A stage in the middle that plays a short animated explainer for the selected scenario: the subject, the lists the wallet follows, every writer that flagged it and what it said, how the rule counts them, the verdict. A prediction card at the bottom right that says what the wallet should show, with the one amber Send button. The top right of the viewport stays empty, because that is where the MetaMask popup lands; the explainer ends by pointing there.

The page still checks nothing. Every fact on the stage comes from the scenario constants, which the existing test pins to the demo address table. The stage is the presenter's prediction, drawn. The wallet is the proof.

## What the audience sees, in order

1. Presenter clicks "Send ETH to the drainer receiver" in the rail. The stage clears in one cross-fade.
2. The subject pill lands in the centre: label `drainer-receiver-1`, address in mono, category `DRAINER_RECEIVER`.
3. The three lists the wallet follows rise on the left, staggered: `tocsin.eth`, `harborwatch.eth`, `lanterndao.eth`. Under each, its writers as small mono pills. `tocsin.eth` shows two: manual and detector.
4. For each writer that flagged the subject, a hairline draws from the writer to the subject. A caption types next to it: "harborwatch.eth flagged it: DRAINER_RECEIVER, weight 255, evidence 0x3725…9dce". One caption after another, 0.4 s apart.
5. The counter. A short line under the subject: "independent writers: 1 … 2 … 3". Writers that share an operator collapse into one with a small note ("two tocsin.eth writers, one operator, counts once").
6. The rule, in one sentence that changes with the case: "one writer at weight 255 blocks on its own", or "two independent writers block", or "one writer at weight 1 warns", or "category 8 warns and never blocks", or "retracted: tombstoned, counts as nothing".
7. The verdict word lands: Clean in paper, Warn in paper with an amber underline, Blocked in alert red. Red appears nowhere else on the page.
8. The strike: one ripple runs outward through the background dot field from the verdict, the only moment the background moves on this page.
9. Handoff: the caption "now the wallet" with a thin arrow easing toward the top-right corner, and the Send button in the prediction card turns amber. Presenter clicks Send. MetaMask opens top right, over an empty region of the page, and says the same thing.

The whole explainer runs under eight seconds. A replay control restarts it. Selecting another scenario interrupts it cleanly.

## Scenes

Every scenario maps to one of these scene shapes. The shape is derived from the constants, not hand-picked per row.

| Shape | Trigger | What is different on stage |
| --- | --- | --- |
| clean | no lists flag the subject | lists rise, no lines draw, caption "no list you follow has a flag on this", verdict Clean, no ripple |
| block by weight | at least one flagging writer has weight 255 in a blocking list | that writer's line is heavier (2px), rule sentence names the weight |
| block by count | two or more independent weight-1 writers on one list | counter is the hero, collapsing shared operators is shown |
| warn | flags exist but no list reaches block | rule sentence says why not, the line stays hairline |
| warn-only category | category 8 (THEFT_PROCEEDS) or any category in the policy's warn-only set | verdict would be Block, a cap drops it to Warn with caption "category warns and never blocks a send" |
| retracted | the flag has a TOMBSTONE | line draws, then a strike runs through it and it fades, verdict Clean, caption "retracted by the writer, the log keeps both entries" |
| token context | the subject is the token contract (fakeUSDC) | subject pill shows the token symbol and "the contract itself", context label `token` |
| spender context | approve rows | context label `spender`, caption "an approval is a recipient of your allowance" |
| swap recipient | swap rows | a second pill, the router, with the caption "the decoder reads through the swap to the recipient" |
| unverifiable | the poison RPC toggle is on and the row is drainer-receiver-1 | before any list draws, a sequence strip `1 2 3 4 …` appears under `tocsin.eth`; the fold replays, sequence 1 is missing, the strip breaks, caption "chain mismatch at sequence 1: unverifiable, never clean", verdict Unverifiable in amber, no flags are drawn because the wallet refuses to trust the data |

The poison RPC toggle on the stage is a preview, not a switch. It changes the explainer and the prediction. A line under it says "the wallet only uses the poison RPC if you pasted it into the Snap or Kohaku setting", with the two copy boxes from the current spec next to it.

## Policy preview

Two chips above the prediction card: threshold `2 writers` / `1 writer`, and `warn-only categories on / off`. They re-run the explainer with that policy and change the predicted verdict. They do not change the wallet. The caption under them says so: "set it in the Snap policy to make the wallet agree". This is how the lanterndao-only row goes from Warn to Blocked on stage before the presenter flips the Snap.

## Layout

Desktop only, 1440 and 1920 wide, since the demo runs on a laptop projected. Below 1200 the rail collapses into a dropdown and the stage stacks above the card; it only has to not break.

```
+--------------------------------------------------------------------------------+
| tocsin  Demo · Sepolia                                         [connect] [snap] |
+---------------+-------------------------------------------+--------------------+
| SEND ETH      |                                           |                    |
|  clean        |                                           |   (kept empty:     |
|  poisoning op |                 STAGE                     |    MetaMask lands  |
|> drainer recv |                                           |    here)           |
|  ...          |     lists        subject       verdict    |                    |
| SEND TOKEN    |                                           +--------------------+
|  ...          |                                           | PREDICTION         |
| APPROVE       |                                           | wallet should say  |
|  ...          |                                           | Blocked            |
| SWAP          |  [poison rpc preview]  [threshold] [warn] | [ Send ]  [replay] |
+---------------+-------------------------------------------+--------------------+
```

Rail: 280px, groups as mono labels, rows as plain text, the selected row has a 2px paper left bar. Rows Kohaku cannot catch yet carry a small `snap only` mono tag; when the connected wallet is Kohaku their Send is disabled with the reason beside it.

Stage: `ink-800` panel with the hairline border, the dot field visible in the gutters around it. Schematic language from `design/kit/scenes.css`: 1.5px `ink-600` connectors, mono pills on `ink-800`, one solid `paper-100` hero node (the subject).

Prediction card: 360px wide, bottom right, at least 420px of clear space above it. The Send button is the only amber element on the page. When the scenario is clean the button is paper, not amber, so amber keeps meaning "the strike".

Header: wordmark, "Demo · Sepolia", the existing RainbowKit connect button restyled with the kit, and Install Snap. Debug Contracts and Block Explorer move into a small overflow menu; they are not part of the show.

Presenter mode: `P` hides the header and the rail labels' secondary text, enlarges stage type by 1.25, and keeps the rail. `Esc` leaves it. Arrow keys move the selection, `Enter` sends, `R` replays.

## Visual rules (from `design/DIRECTION.md`, applied here)

- Palette is the token set in `design/kit/tokens.css`. No DaisyUI classes remain in the body. Badges become mono pills.
- Type is Inter for everything written, JetBrains Mono for addresses, labels, sequence numbers and the caption that reads like a log line.
- Amber once per screen: the Send button when the verdict is not clean, otherwise the Unverifiable word. Red only on the verdict word Blocked and the broken sequence strip.
- Entrances 240ms ease-out with a 12px rise, at most three elements staggered 80ms apart. Scene steps 400ms apart. Verdict 650ms after the rule sentence. Cross-fades 700ms.
- Lines draw with `stroke-dashoffset`, 400ms each. Nothing bounces, nothing scales from zero, nothing loops except the dot field.
- `prefers-reduced-motion`: the stage renders the final frame with every caption visible, no ripple.
- The dot field (`design/kit/ringfield.js`) sits behind the page, masked under text. It strikes exactly once per explainer, at the verdict. Idle ambient strikes stay off on this page so they never compete with the wallet popup.

## Data

The scenario table in `dapp/packages/nextjs/utils/demo/scenarios.ts` stays the source. Two additions, both constants, both covered by the existing tsv test:

```ts
export type Flag = { list: TrustList; writer: "manual" | "detector" | "harborwatch" | "lanterndao"; weight: 1 | 255; category: string; evidence: Hex; tombstoned?: boolean };
// per scenario
flags: Flag[];               // every FLAG leaf on the subject that a followed list can see
context: "recipient" | "spender" | "token";
```

A `LISTS` constant describes the three lists as the wallet follows them: name, writers with weights and operator, blocking flag. Writers and weights come from the two list documents already in the repo (`docs/plan/demo/seed/*.list.json` and the infra curators manifest); evidence hashes come from the curators manifest.

`explain(scenario, policy, poison): Scene` is a pure function in `utils/demo/explain.ts` that returns the scene shape, the ordered steps, the rule sentence and the predicted verdict. It mirrors the reader's rules (independent writers, operator collapse, weight 255, warn-only cap, tombstone, OR across lists) but it is presentation code and must say so in a comment. The one test that matters: for every scenario, `explain(...).verdict === scenario.expected` under the default policy. That ties the drawing to the table, and the table to the chain.

## Wallet handoff

The Send path is unchanged: `buildTx` then wagmi `sendTransaction` to the connected wallet. Two additions. The card reads the connector name and says "MetaMask with the Tocsin Snap" or "Kohaku" so the presenter knows which host will answer. When the request is rejected (4001) the card says "you rejected it in the wallet", when it fails for any other reason the plain error sits under the button, as the current page already does.

## Tickets

Each one is a day or less for one agent, in order.

- 06 Kit port. `tokens.css` and `fonts.css` into the Next.js package, the dot field mounted behind the page, DaisyUI removed from the body, header and rail laid out as above with the existing scenarios rendering as plain rows. Prediction card with the current verdict text and the Send button. Nothing animates yet. Acceptance: screenshot at 1440 matches the layout block; no `badge-*` classes; connect, Install Snap and Send still work on Sepolia.
- 07 Stage engine and the four base shapes. `explain.ts` with the test above. The stage plays clean, block by weight, block by count and warn with steps 1 to 9 from "What the audience sees". Replay and interruption. Reduced motion. Acceptance: every Send ETH row plays under eight seconds; the explain test passes.
- 08 Variants. Warn-only category, retracted, token context, spender context, swap recipient, and the poison RPC preview with the sequence strip. Policy preview chips. Acceptance: each variant has a scenario that reaches it, the predicted verdict flips as described for lanterndao-only and poisoning-funder rows.
- 09 Handoff and presenter mode. Host name on the card, Kohaku disabling of snap-only rows, keyboard controls, presenter mode, the strike at the verdict and the arrow to the top right. Acceptance: rehearsal from the runbook's three beats with no mouse except the Send clicks.

## Out of scope

- Any live read of the log, the lists or ENS on the page. The stage draws the constants.
- Changing the reader's policy or the Snap from the page.
- Mobile layout beyond not breaking.
- New scenarios or seeding. Those belong to tickets 02 and 05 on feat/demo.
- Sound. The bell is a visual.
- Explaining the light client or the fold beyond the one unverifiable scene. The landing page and the deck carry that.

## Notes for whoever builds it

- `design/kit/scenes.js` already draws writers appending, a wallet replaying a head, and a lying RPC caught. Lift its pill, connector and typewriter helpers rather than writing new ones; the unverifiable scene is its third loop cut down.
- The teammate's evaluate code in `dapp/packages/reader/src/evaluate.ts` is the reference for the rule sentences. Read `CONTEXT_CATEGORIES`, `trusts`, and the threshold handling before writing `explain.ts`, and keep the two in step by hand; they are not shared code on purpose, because the page must never be the thing that decides.
- Red is the alert token `#e5484d`. Do not introduce a green for Clean. Clean is paper.
- Keep the top-right 420 by 640 region free of anything the audience needs to read after Send is clicked.
