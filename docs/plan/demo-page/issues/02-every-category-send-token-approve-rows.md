# 02: Every category from a button: the remaining send, token and approve rows

Spec: `docs/plan/demo-page/spec.md`, Implementation decisions, Groups and rows, Badges. Demo address table: `docs/plan/demo/test-addresses.tsv`.

**What to build:** The presenter can show warn versus block, the policy dropdown, a tombstoned flag, a flagged token contract and a drainer spender, each from one button. Rows Kohaku cannot catch yet say so.

**Blocked by:** 01 (the scenario table and page the rows join)

**Ethskills:** frontend-ux, qa (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Send ETH group gains: poisoning-operator-1 (warn), paid-lookalike-1 (block), theft-proceeds-1 (warn, note "category 8 never blocks a send"), lantern-poisoning-operator-1 (warn, note "Snap policy set to 1 writer: block"), harbor-drainer-receiver-1 (block), paid-lookalike-retracted (clean, note "tombstoned").
- [x] Send token group: realUSDC `transfer` to drainer-receiver-1 (block), fakeUSDC `transfer` to the demo account (block, `snapOnly`). One token unit each.
- [x] Approve group: realUSDC `approve` to drainer-spender-1 (block), realUSDC `approve` to SwapRouter02 on Sepolia (clean).
- [x] Three group headings, every row visible, no tabs. The `snapOnly` badge reads "Snap only until Kohaku lands lists and token checks" and is set on the fakeUSDC row and on rows flagged only by harborwatch or lanterndao.
- [x] A `node --test` case asserts every row's address, lists and expected verdict match the demo address table. Fails if a row is edited to disagree.
- [ ] Rehearsed with the Snap on Sepolia: lantern-poisoning-operator-1 warns at policy 2 and blocks at policy 1, harbor-drainer-receiver-1 blocks, paid-lookalike-retracted passes, fakeUSDC transfer blocks naming the token, drainer-spender-1 approve blocks. Recorded in Comments.

## Comments

- 2026-11-06: All rows are in `dapp/packages/nextjs/utils/demo/scenarios.ts`. Token rows move 1 unit, which is 1,000,000 base units because `MockToken` has 6 decimals; `decimals()` on Sepolia returns 6 for both tokens. SwapRouter02 is `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`, checked on Sepolia with `cast`. `WETH9()` returns `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, `factory()` returns the v3 factory `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`, and the bytecode carries the `exactInputSingle` selector `0x04e45aaf`.
- The page shows four group headings, because ticket 03's Swap group is already in.
- A few rows carry a note the spec doesn't list, written for the presenter. poisoning-operator-1 says two lists still warn, harbor-drainer-receiver-1 says one weight-255 writer blocks alone, and the SwapRouter02 approve says to run it before the clean swap.
- The test is `yarn workspace @se-2/nextjs test` (`node --test utils/demo/*.test.ts`). It keys tsv rows by label, cut at " (" so "fakeUSDC (symbol USDC, ...)" matches "fakeUSDC". For each row with a tsv label it checks address, lists, category, verdict and the `snapOnly` rule. Any other label must be one of demo account, SwapRouter02 or connected account, so a typo fails instead of skipping. Those three must be unflagged and clean, and the demo account must match the runbook. The two token addresses are checked against the tsv too. I flipped theft-proceeds-1 to block once and the test failed with "send-theft-proceeds-1: expected verdict".
- While I worked, the tsv gained poisoning-funder-1 and malicious-delegate-1. The test now accepts tsv rows with no send verdict, such as the delegate. Ticket 05 adds the funder as one object in `SCENARIOS`. It is lanterndao-only, so the test will want `snapOnly: true`.
- `tsconfig.json` gained `allowImportingTsExtensions`, because node needs the `./scenarios.ts` extension and tsc rejects it otherwise. It is allowed because the config has `noEmit`. An editor that shows "An import path can only end with a '.ts' extension" loaded the config before this change; restart its TS server.
- Needs a human: the box 6 rehearsal in MetaMask Flask. I can't drive a wallet.
