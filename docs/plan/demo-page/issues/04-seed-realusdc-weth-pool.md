# 04: One-time realUSDC/WETH pool on Sepolia so the clean swap succeeds

Spec: `docs/plan/demo-page/spec.md`, Implementation decisions, Pool. Keystore flow: `dapp/packages/foundry/scripts-sh` and `scripts-js`. Token addresses: the tokens manifest in the infra package.

**What to build:** Anyone on the team with the deployer keystore runs one foundry script once. Afterwards the presenter presses "approve router" then "clean swap" and the swap confirms on Sepolia. Running the script a second time changes nothing.

**Blocked by:** 03 (the clean swap row that proves it)

**Ethskills:** addresses, building-blocks, orchestration, gas (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] A foundry script that wraps a small amount of ETH to Sepolia WETH, mints realUSDC to the deployer, creates and initialises the realUSDC/WETH 0.3% pool through NonfungiblePositionManager if absent, and mints one full-range position at about 1 USDC to 0.00001 WETH.
- [x] Runs through the existing keystore selection flow. No private key in env or args.
- [x] A forge dry run against a Sepolia fork completes; a second run against the same fork creates no second pool and reports it already exists.
- [ ] Pool address and transaction hash written to the tokens manifest.
- [ ] Run once on Sepolia. The clean swap row from ticket 03 confirms on chain from the demo account. Hashes recorded in Comments.

## Comments

**6 Nov, agent.** Script is `dapp/packages/foundry/script/SeedPool.s.sol`. Hook is `yarn seed-pool` in `packages/foundry`, which is `parseArgs.js --file SeedPool.s.sol --network sepolia`, so it goes through the same keystore selection and `make deploy` as `yarn deploy`. It puts 100 realUSDC and 0.001 WETH in one full-range position (ticks -887220 to 887220), and the pool starts at sqrtPriceX96 250541448375047931186413801569606. realUSDC is token0, so the raw price is 1e13 / 1e6 = 1e7. The script asserts both the ordering and the sqrt. A rerun stops when the pool exists with liquidity above zero. If the pool exists but holds no liquidity (say a run died after the create), the rerun adds the position.

Addresses checked on Sepolia at block 12075955: WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` (symbol WETH, 18 decimals), UniswapV3Factory `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` (fee 3000 has tick spacing 60), NonfungiblePositionManager `0x1238536071E1c677A632429e3655c799b22cDA52` (`factory()` and `WETH9()` match the two above), SwapRouter02 `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` (same factory and WETH9).

Fork results:
- Dry run, `forge script --rpc-url sepolia --fork-block-number 12075967 --sender <minter>`: completes. Pool `0x7F47Ccd19952520747A0A1D1F3dd738759b98320`, liquidity 316227766016, 100000000 realUSDC and 999999999997351 wei WETH in.
- anvil fork at block 12076072, two `--broadcast` runs with `--unlocked` as the minter. Run 1 creates that pool and mints position 234151. Run 2 logs "Pool already exists with liquidity, nothing to do" and broadcasts nothing. `getPool` still returns the same address.
- On the same fork the demo account approved SwapRouter02 and swapped 1 realUSDC through `exactInputSingle` (fee 3000, min out 0) for 9871580343970 wei WETH. Status 1, 347,623 gas.

The pool address comes from the factory's CREATE2, so Sepolia will get the same `0x7F47Ccd19952520747A0A1D1F3dd738759b98320`.

Gas: pool creation is about 35.2M gas on Sepolia now (`cast estimate`), and forge sets a 47.7M limit. That is above 2^24, but five pools created through this factory between blocks 12073509 and 12075712 had limits of 39M to 47.7M and all succeeded, so Sepolia accepts it. At today's gas price of about 19 wei the whole run costs well under 0.0001 ETH plus the 0.001 ETH wrapped.

**Not broadcast to Sepolia, needs a human.** Two blockers:
1. forge asks for the keystore password and there is no `ETH_PASSWORD` file, so it cannot run unattended.
2. MockToken `mint` is minter-only, not open. realUSDC's minter is `0x7Bae2bbcEC2c9424aCCBB6a7EB43301D8Cc92C98`, the infra relayer key that ran `seed-tokens.ts`. The `tocsin-deployer` keystore is `0x8e2cc65a08154a357136c8060de5232fddee3e31`, which holds 0 realUSDC. The script mints when the sender is the minter and otherwise needs the sender to already hold 100 realUSDC. If neither holds, it reverts before sending anything.

To unblock, either send 100 realUSDC from the demo account `0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca` (it holds 1000) to `0x8e2cc65a08154a357136c8060de5232fddee3e31`, or import the relayer key as a keystore with `yarn account:import` and pass that keystore name below. Then, from `dapp/packages/foundry`:

```bash
yarn seed-pool --keystore tocsin-deployer
```

Then write the pool into the manifest from the same directory:

```bash
tx=$(jq -r '.transactions[] | select((.function // "") | startswith("createAndInitializePoolIfNecessary")) | .hash' broadcast/SeedPool.s.sol/11155111/run-latest.json)
m=../infra/tokens-manifest.11155111.json
jq --arg tx "$tx" '.realUSDCWETHPool = {address: "0x7F47Ccd19952520747A0A1D1F3dd738759b98320", tx: $tx}' "$m" > "$m.tmp" && mv "$m.tmp" "$m"
```

`yarn seed-pool` ends with the usual `generateTsAbis.js` step. It only picks up CREATE transactions, so this run adds nothing to `deployedContracts.ts`.
