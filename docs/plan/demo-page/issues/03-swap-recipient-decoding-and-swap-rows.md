# 03: Swap recipient in the shared decoder, Kohaku patch, and the two swap rows

Spec: `docs/plan/demo-page/spec.md`, Implementation decisions, Decoder and Groups and rows (Swap). Kohaku patch workflow: `dapp/packages/kohaku/README.md` in the Kohaku worktree.

**What to build:** The presenter presses "swap to drainer receiver" and the Snap blocks it, naming the drainer receiver as the recipient of the swap. Kohaku does the same. The extension inherits the check. A second "clean swap" row sends the same swap to the connected account and is expected to pass the wallet (it reverts on chain until ticket 04 seeds the pool, which is fine).

**Blocked by:** 02 (the scenario table with every group). The decoder work itself can start immediately.

**Ethskills:** addresses, frontend-ux (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] The Snap's shared decoder recognises SwapRouter02 `exactInputSingle` and emits the params recipient as a `recipient` target, with the router kept as a `recipient` target as before. Unknown calldata still adds nothing.
- [x] A `node --test` case in the Snap decode suite: encoded `exactInputSingle` calldata with a given recipient yields that recipient as a recipient target. Fails before the change.
- [x] The extension build picks up the change with no edit of its own (it imports the decoder).
- [x] The Kohaku commons decoder copy gets the same ABI and target, with a mirror jest case. Patches regenerated with the repo's update script; `setup.sh` on a fresh clone applies cleanly.
- [x] The scenario table gains a Swap group: recipient drainer-receiver-1 (block) and recipient self (clean, note "needs the pool"). Both call SwapRouter02 on Sepolia with realUSDC in, Sepolia WETH out, fee 3000, 1 realUSDC in, minimum out 0.
- [ ] Rehearsed with the Snap: the drainer swap row is blocked and the verdict names the drainer receiver. Recorded in Comments.

## Comments

- 2026-11-06, swap rows only: the Swap group is in `dapp/packages/nextjs/utils/demo/scenarios.ts`, and its box can be ticked by whoever closes this ticket. Both rows call `exactInputSingle` on SwapRouter02 `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`. They send realUSDC in, Sepolia WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` out, fee 3000, 1 realUSDC in (1,000,000 base units), minimum out 0 and no price limit. Ticket 02's comment has the onchain check of both addresses. The drainer row pays drainer-receiver-1 (block). The clean row pays whichever account is connected at click time (clean, note "Needs the pool.").
- viem hands a JSON-RPC account's transaction straight to `eth_sendTransaction` without estimating gas. So the swap reaches the wallet's insight even though it reverts onchain today, with no pool and no allowance. MetaMask may add its own "may fail" warning. The clean swap needs the SwapRouter02 approve row first and ticket 04's pool.
- Needs a human: the box 6 rehearsal, once the decoder change is in the installed Snap.
- 2026-11-06, decoder: Snap `decode.ts` matches selector `0x04e45aaf` (SwapRouter02 `exactInputSingle`, no deadline) and adds the params recipient as a `recipient` target with why "swap recipient". The new decode case failed before (router only) and passes after; Snap suite 38/38. The extension imports the decoder and builds with no edit. Its two `targets.test.ts` failures predate this ticket (they expect pre-c09f648 output without the token target). Kohaku: same branch and mirror jest case in the commons patch, regenerated with `update-patches.sh`, full `setup.sh` on a fresh clone exits 0, decode suite 15/15. Commit `80d08b8` on feat/kohaku.
