# 06: Seed the Sepolia log and the relayer

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Demo infrastructure, seed, relayer, funding; Keys. PRD: `erc/eip-draft_threat_flag_log.md`, Interface; Categories. HANDOFF step 2.

**What to build:** The deployed log on Sepolia holds about fifty leaves from two writers that cover every leaf kind the demo shows, and a relayer script submits any signed batch a key-without-gas hands it.

**Blocked by:** None. Log-contract ticket 06 deployed the log on Sepolia at `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`, block 12074077.

**Ethskills:** wallets, orchestration, gas (per AGENTS.md; load before starting)

**Status:** resolved

- [x] Seed script: about fifty leaves across the manual writer and the detector key, categories 1, 3, 6, 7, one category 8 leaf, one tombstone of an own leaf, one counter of the other writer's leaf, one dispute. Manual writer through `append`; detector through `appendSigned` via the relayer. Batches capped at 500.
- [x] Relayer script: separate funded key, submits `appendSigned`, drops a batch whose deadline has passed instead of paying for a revert. The detector key holds no ETH.
- [x] Manual writer, relayer, and the demo account are funded from a faucet; the runbook lists the three addresses and the faucet. Keys and RPC URLs come from an ignored env file or keystore.
- [x] Transaction hashes of the seed batches recorded in Comments; explorer shows the `Appended` events.
- [x] A read of the writer sequences after seeding matches the leaf counts the script sent.

## Comments

- 2026-11-06: Built and rehearsed on a local anvil. Nothing has been sent to Sepolia, and nothing can be until log-contract ticket 06 is broadcast.
  - Files, all in `dapp/packages/infra`: `src/seed.ts` (`yarn seed`), `src/relayer.ts` (the in-process `relay()`), `src/relay-cli.ts` (`yarn relay <batch.json>`), `src/batch.ts` (leaf and batch types, `signBatch`, the JSON form and its parser), `src/env.ts` (env loading, chain id and code check), `src/abi.ts`, two Vitest files (`yarn test`), and `.env.example`. `dapp/.gitignore` now ignores `packages/infra/.env`.
  - Keys and the RPC URL come only from `dapp/packages/infra/.env` or the process environment: `RPC_URL`, `CHAIN_ID`, `LOG_ADDRESS`, `MANUAL_WRITER_PRIVATE_KEY`, `DETECTOR_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`. A Foundry keystore is not supported here; the env file is. Both scripts refuse to run if the node's chain id differs from `CHAIN_ID` or `LOG_ADDRESS` has no code. Errors name a variable, never print a value.
  - What the seed sends, 50 leaves in 3 transactions. Manual writer batch 1 through `append`, 22 flags: category 3 five times, 7 five times, 6 five times, 1 six times, 8 once. Detector batch through `appendSigned`, signed in process and handed to `relay()`, 25 flags: category 1 twenty-one times and 6 four times, one of the category 1 flags on the manual writer's own address. Manual writer batch 2, 3 leaves: a tombstone of its own `paid-lookalike-retracted` flag, a counter of the detector's `poisoning-operator-countered` flag, and a dispute (subject is the manual writer) of the detector's flag on it. The `refLeaf` values come from the `Appended` events of the earlier receipts. Every other subject is synthetic, the low 20 bytes of `keccak256("tocsin-demo/<label>")`, so no key exists for it and no real party is named. Evidence is `keccak256("tocsin-demo/evidence/<label>")`, which the panel will show as an evidence bundle hash since no such transaction exists.
  - Why the dispute works this way: a `DISPUTE` must have subject equal to writer, and a reader only syncs pinned writers. So for the dispute to show in the demo, one of the two pinned writers has to be flagged by the other. The detector flags the manual writer, and the manual writer disputes it. A side effect is that the manual writer's own address evaluates as `warn` (detector weight) in the default list.
  - The seed prints chain, log, the three addresses with balances and starting `writerSeq`, and the live gas price, then waits for `SEED` on stdin. It refuses to run if the three keys are not distinct, if the manual writer or relayer has no ETH, or if the detector already has leaves, which makes a second seed fail before sending. It warns if the detector key holds ETH. After sending it reads `writerSeq` for both writers and `globalSeq`, compares them to the counts it sent, and writes `seed-manifest.<chainId>.json` next to `package.json`. Ticket 07 reads `subjects.drainerReceiver` and `subjects.theftProceeds` from it.
  - The relayer drops a batch, and sends nothing, when the batch names another log or chain, when the writer equals the relayer key, when the deadline is earlier than the latest block timestamp plus 30 seconds, when the nonce is not the writer's current `signatureNonce`, or when `simulateContract` reverts (bad signature, bad leaf). RPC failures throw. The CLI exits 0 when sent, 2 when dropped, 1 on error.
  - Rehearsal on anvil 1.9.0, port 8546, chain 31337. Deployed with `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 --broadcast --private-key <anvil key 0>` at the predicted `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`. The manual writer and relayer were anvil dev keys 1 and 2, passed as env vars at run time. The detector was a fresh `cast wallet new` key that held 0 ETH throughout. Results:
    - manual-1: 22 leaves, 308,155 gas. detector-1 via relayer: 25 leaves, 361,011 gas. manual-2: 3 leaves, 70,497 gas.
    - The script read `writerSeq` manual 0 to 25, detector 0 to 25, `globalSeq` 50. `cast call` read the same three values on its own, and `cast logs` returned 50 `Appended` events. The tombstone, counter, and dispute each point at an existing leaf of the right writer and subject.
    - A second `yarn seed` was refused ("detector already has 25 leaves"). `CHAIN_ID=11155111` against anvil was refused ("RPC_URL answers chain id 31337").
    - `yarn relay` with a batch whose deadline was one second before the latest block: dropped, exit 2, and the relayer's transaction count stayed at 1. A live one-leaf batch: sent, 67,825 gas, count went to 2. Replaying the same file: dropped on nonce. A leaf edited after signing: dropped with simulation reverted "sig".
  - Gas on Sepolia will be higher than these numbers. Log-contract ticket 06 measured a one-leaf append at 466,147 gas on a Sepolia fork against 119,815 in the cancun snapshot, about 4x. At that ratio each seed batch is around 1.5M gas, far under the EIP-7825 cap of 16,777,216, and the whole seed is under 5M gas. At the 21 wei gas price measured on 2026-11-06 that is a fraction of a gwei in total. Recheck with the printout before typing `SEED`.
  - Open: the relayer has no retry or fee bump for a transaction that stays pending. On Sepolia it waits 180 seconds for a receipt and throws. If the seed fails after manual-1 lands but before the detector batch, rerunning it will send manual-1 again, because the guard only looks at the detector's sequence. The verification would still pass since it compares against starting sequences, but the log would hold duplicate flags.
  - The human runs, once, after log-contract ticket 06 is broadcast:
    1. Make three new keys with `cast wallet new`: manual writer, detector, relayer. Do not reuse the deployer or any anvil key. Put them in `dapp/packages/infra/.env` with `RPC_URL=<Sepolia RPC URL>`, `CHAIN_ID=11155111`, and `LOG_ADDRESS=<deployed address from log-contract ticket 06>`.
    2. Fund three addresses with Sepolia ETH. 0.05 ETH each is plenty. Suggested faucet: Google Cloud Web3 faucet, https://cloud.google.com/application/web3/faucet/ethereum/sepolia, with the PoW faucet at https://sepolia-faucet.pk910.de as a fallback. Do not fund the detector.
       - Manual writer: `<MANUAL_WRITER_ADDRESS>`
       - Relayer: `<RELAYER_ADDRESS>`
       - Demo account in Kohaku: `<DEMO_ACCOUNT_ADDRESS>`
    3. From `dapp/`:

       ```
       yarn workspace @tocsin/infra test
       yarn workspace @tocsin/infra seed
       ```

       Check the printed chain (11155111), log address, balances, and gas price, then type `SEED`. If it stops partway, read the printed tx hashes before running it again (see Open above).
    4. Open each tx hash from `seed-manifest.11155111.json` at `https://sepolia.etherscan.io/tx/<hash>#eventlog` and confirm the `Appended` events. Record the three hashes here, fill in the three addresses above, commit the manifest, and tick boxes 3 to 5.
- 2026-11-06: Box 3 ticked. Keys were generated with `cast wallet new` straight into the ignored `packages/infra/.env` and `packages/reader/.env`, and none passed through a chat. The faucet sent 0.5 Sepolia ETH to the deployer, which is also the ENS owner key. The deployer then sent 0.05 each to the manual writer (`0xcc567e58def9a057878dde310f0c19c522060a26c583a223290f4a4669a1fdaf`), the relayer (`0x967c49145f3b0c7359c0ff2fa1c76f4f851c80f4dc2a1167141788ef8515e62a`), the maintainer (`0xc93eaf73caa6366ce8e22a4ae9da8dc64f092918f45e727e44bf083a06e2b0a0`), and the demo account (`0x47c978172d7d1e3eb53c0aba588731e15f7f0bd3cabbe5c82ba7f310d726760f`). The detector holds 0. The runbook's "Keys, addresses, and funding" lists every address. Next: `yarn workspace @tocsin/infra seed`.
- 2026-11-06: Seeded on Sepolia. Boxes 4 and 5 ticked. `yarn workspace @tocsin/infra seed` from block 12074111, gas price 20 wei.
  - manual-1: 22 leaves, tx `0x61529bed77224a4ef8a227043169df8bb34ef92f4c51a45ca3aaf1845b5481e7`, block 12074112, 459,187 gas.
  - detector-1 via the relayer: 25 leaves, tx `0x45814d5eabcc0cc08571c121055153c4ded5e7ce14066be70d1344caeac34bb3`, block 12074114, 634,908 gas.
  - manual-2: 3 leaves, tx `0x758820df8eff7d9002877a508097fc5ab6547ca07b82a7fada057a8ca62477aa`, block 12074115, 93,405 gas.
  - The receipts carry 22, 25, and 3 `Appended` logs from the log address. `cast call` reads `writerSeq` 25 for the manual writer, 25 for the detector, and `globalSeq` 51. That is 50 seed leaves plus the deployer's smoke leaf. The detector still holds 0 ETH.
  - `packages/infra/seed-manifest.11155111.json` is committed, since `mirror` and ticket 07 read it.
