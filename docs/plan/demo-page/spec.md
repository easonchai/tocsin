# Demo page: one click per scenario

Status: ready-for-agent

Settled in a grilling session on 2026-11-06. Supersedes nothing: `docs/plan/demo/spec.md` says the Next.js package is the harness, and this spec adds a second job for it. HANDOFF.md decisions still win where they overlap.

## Problem statement

Presenting the three beats today means typing addresses by hand into a wallet send form, switching tokens, and remembering which label is on which list and whether it should warn or block. One typo and the beat shows the wrong thing. There is no way to show a swap at all, because nothing in the wallets reads a swap recipient. The poison RPC URL and the honest one live in a runbook, not where the presenter is looking.

## Solution

The Next.js home page becomes a demo board. The presenter connects MetaMask (with the Snap) or the forked Kohaku through the normal connect button, and gets one button per scenario. Each row says what it does, which trust lists flag the subject and in which category, and what the wallet should say when the button is pressed. The page never checks anything itself. It builds the transaction and hands it to the wallet, so the audience sees the wallet catch it.

Two read-only boxes at the top hold the poison RPC and the honest RPC with copy buttons, with a note that they go into the Snap or Kohaku RPC setting.

A swap row exists because the shared decoder learns the SwapRouter02 `exactInputSingle` recipient. A one-time foundry script creates a realUSDC/WETH pool so the clean swap can go through; the blocked swap never reaches the chain and does not need the pool.

## User stories

1. As a presenter, I want to connect the wallet from the home page, so that the demo starts on one screen.
2. As a presenter, I want an Install Snap button, so that installing the Snap from the local dev server is one click.
3. As a presenter, I want the forked Kohaku to appear in the connect dialog without extra setup, so that switching hosts mid-demo is a wallet change only.
4. As a presenter, I want one button per scenario, so that I never type an address on stage.
5. As a presenter, I want every row to show the expected wallet verdict before I click, so that the audience hears the prediction and then sees it.
6. As a presenter, I want every row to show which trust lists flag the subject, so that I can say "harborwatch and lanterndao both flag this" without looking it up.
7. As a presenter, I want every row to show the category name, so that I can explain what kind of infrastructure the subject is.
8. As a presenter, I want a clean send row, so that the audience sees the wallet pass a normal transaction.
9. As a presenter, I want a row for a subject flagged by two weight-1 writers on two lists, so that I can show that two lists do not add up to a block.
10. As a presenter, I want a row for a subject flagged only by lanterndao, so that I can show a warn, then flip the Snap policy to one writer and show it block.
11. As a presenter, I want a row for a subject flagged only by harborwatch, so that I can show a weight-255 writer blocking alone.
12. As a presenter, I want a row for the drainer receiver that all three lists flag, so that beat one has a button.
13. As a presenter, I want that row to say what the poison RPC does to it, so that beat two has the same button.
14. As a presenter, I want a row for a theft-proceeds subject, so that I can show a category that warns on a send and never blocks.
15. As a presenter, I want a row for a tombstoned flag, so that I can show a retracted flag coming back clean.
16. As a presenter, I want a row for a paid lookalike, so that category 6 has a button.
17. As a presenter, I want a row sending realUSDC to the drainer receiver, so that the audience sees the recipient check inside an ERC-20 transfer.
18. As a presenter, I want a row sending fakeUSDC to a clean address, so that the audience sees the token contract itself get blocked.
19. As a presenter, I want a row approving realUSDC to a drainer spender, so that category 7 has a button.
20. As a presenter, I want a row approving realUSDC to SwapRouter02, so that the clean swap can run.
21. As a presenter, I want a swap row whose recipient is the drainer receiver, so that the audience sees the wallet read through a swap.
22. As a presenter, I want a clean swap row, so that the audience sees a swap pass when the recipient is clean.
23. As a presenter, I want rows Kohaku cannot catch yet to say so, so that I do not click them in Kohaku and watch them sail through.
24. As a presenter, I want the poison RPC and the honest RPC on the page with copy buttons, so that beat two and beat three need no runbook.
25. As a presenter, I want the page to say where the RPC goes, so that nobody pastes it into MetaMask network settings by mistake.
26. As a presenter, I want fixed tiny amounts, so that no input field can be left empty or mistyped.
27. As a presenter, I want the page to target Sepolia, so that the wallet does not ask me to switch to a local chain that is not running.
28. As a teammate, I want the scenario table in one constants file, so that adding a row is one edit.
29. As a teammate, I want a test that the scenario table agrees with the demo address table, so that a reseed does not leave the page lying.
30. As a teammate, I want the pool setup to be a script anyone with the deployer keystore can run once, so that it is not tied to one laptop.
31. As a Snap user, I want a swap whose recipient is a flagged drainer receiver to be blocked, so that the swap path is as safe as a plain send.
32. As a Kohaku user, I want the same swap check, so that both hosts agree.
33. As an extension user, I want the same swap check, so that the provider proxy inherits it from the shared decoder.
34. As a judge, I want the page to do no checking of its own, so that what I see is the wallet's verdict and not the dapp's.
35. As a curator, I want every category a send or approve can reach to have a seeded subject, so that the demo covers the ERC's table.

## Implementation decisions

**Page.** The stock Scaffold-ETH welcome body is replaced. The header keeps Debug Contracts and Block Explorer. The existing RainbowKit connect button stays. One Install Snap button calls the Snap install RPC against the local Snap dev server. Kohaku is expected to appear through EIP-6963 discovery in RainbowKit; if it does not, a plain injected connector is added and nothing Kohaku-specific.

**Scaffold config.** Target networks become Sepolia only. The burner wallet disappears because Scaffold shows it only on local chains. Debug Contracts reads the Sepolia entry that already exists.

**Scenario table.** One constants module in the Next.js package holds every row: title, group, the subject label from the demo address table, the subject address, which trust lists flag it, the category name, the expected verdict (`clean`, `warn`, `block`), a `snapOnly` flag, and an optional note. Amounts are fixed: a small ETH amount for sends, one token unit for ERC-20 transfers and approves, one realUSDC for swaps. The page builds calldata from the row and calls the wallet through wagmi. It performs no lookups and no evaluation.

**Groups and rows.**

Send ETH:
- clean, to the demo account
- poisoning-operator-1: tocsin.eth detector and lanterndao.eth, warn
- drainer-receiver-1: all three lists, block; note "with poison RPC: unverifiable, chain mismatch at sequence 1"
- paid-lookalike-1: tocsin.eth and lanterndao.eth, block
- theft-proceeds-1: tocsin.eth, warn; note "category 8 never blocks a send"
- lantern-poisoning-operator-1: lanterndao.eth only, warn; note "Snap policy set to 1 writer: block"
- harbor-drainer-receiver-1: harborwatch.eth only, block
- paid-lookalike-retracted: no lists, clean; note "tombstoned"
- poisoning funder: added by the seed ticket once a category 2 subject exists

Send token:
- realUSDC to drainer-receiver-1, block
- fakeUSDC to the demo account, block, token context, `snapOnly`

Approve:
- realUSDC to drainer-spender-1, block
- realUSDC to SwapRouter02, clean

Swap:
- `exactInputSingle` realUSDC to Sepolia WETH, fee 3000, recipient drainer-receiver-1, block
- same with recipient the connected account, clean; note "needs the pool"

**Badges.** List names and category come from the constants, copied from the demo address table. No live read of the log for labels. The `snapOnly` badge reads "Snap only until Kohaku lands lists and token checks". Rows flagged only by harborwatch or lanterndao, and the fakeUSDC row, carry it until the Kohaku port follows those lists and adds the token target.

**RPC boxes.** Poison `http://127.0.0.1:8550` (the lying log proxy), honest `https://0xrpc.io/sep`. Each has a copy button. One line says "paste into the Snap or Kohaku RPC setting".

**Threshold.** The reader's two-writer threshold stays per list. The dropdown demo is the lanterndao-only row at threshold 2 (warn) and threshold 1 (block). No cross-list counting.

**Decoder.** The shared decoder in the Snap gains the SwapRouter02 `exactInputSingle` ABI and emits the params recipient as a `recipient` target. The router address stays a `recipient` target as before. The extension inherits it by import. The Kohaku commons patch gets the same addition in its decoder copy, and the patch files are regenerated with the repo's update script.

**Pool.** A foundry script wraps a small amount of ETH to Sepolia WETH, mints realUSDC from the deployer (MockToken has open mint), creates and initializes a realUSDC/WETH 0.3% pool through NonfungiblePositionManager if it does not exist, and mints one full-range position at about 1 USDC to 0.00001 WETH. The pool address is recorded in the tokens manifest. It runs through the existing keystore flow and is safe to rerun.

**Seeding gaps.** The demo address table has no subject for POISONING_FUNDER (2) or MALICIOUS_DELEGATE (4). A seed addition puts a funder on lanterndao.eth and a delegate on tocsin.eth's manual writer. The curator seeder refuses to run against a writer that already has leaves, so the addition needs its own append path. The list documents already trust all categories 1 to 127 for these writers, so no list document or ENS record changes.

## Testing decisions

A good test exercises a public seam with real inputs and checks the observable result. The seams, highest first:

1. The shared decoder's `transactionTargets` function, already covered by `node --test` in the Snap package. Add one case: calldata for `exactInputSingle` with a recipient yields that recipient as a `recipient` target alongside the router. The Kohaku jest decode suite gets the mirror case.
2. The scenario constants. One `node --test` case loads the demo address table and asserts that every row's subject address, lists and expected verdict match it. This is what catches a reseed.
3. The pool script. A forge dry run against a Sepolia fork must complete, and a rerun must not create a second pool.

No React component tests. The page's behaviour is "the wallet shows the verdict", which the runbook's rehearsal checks by hand.

## Out of scope

- Counting writers across lists, or any change to the reader's policy.
- Universal Router decoding. Only SwapRouter02 `exactInputSingle`.
- Category 4 as a page row. It needs an EIP-7702 delegation, which no host's send surface issues.
- Kohaku support for harborwatch, lanterndao and the token target. Ticket 16 in the Kohaku worktree owns that.
- A `wallet_addEthereumChain` scenario for the poison RPC.
- Amount inputs, address inputs, or any form on the page.
- A live list-membership read on the page.
- A clean swap on any venue other than the seeded pool.

## Further notes

- The demo address table is the source of truth for labels and expected verdicts. If a reseed changes it, the constants test fails and the page must be updated.
- The lying proxy drops the manual writer's sequence 1, which is the drainer-receiver-1 flag. That is why only that row carries the poison RPC note.
- Writers sharing an operator count as one. The two tocsin.eth writers are one group, which is why a tocsin-only detector flag plus a lanterndao flag is two groups on two lists and still warns.
