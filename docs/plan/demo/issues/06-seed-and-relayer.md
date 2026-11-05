# 06: Seed the Sepolia log and the relayer

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Demo infrastructure, seed, relayer, funding; Keys. PRD: `erc/eip-draft_threat_flag_log.md`, Interface; Categories. HANDOFF step 2.

**What to build:** The deployed log on Sepolia holds about fifty leaves from two writers that cover every leaf kind the demo shows, and a relayer script submits any signed batch a key-without-gas hands it.

**Blocked by:** None locally. Needs log-contract ticket 06 (the log deployed on Sepolia).

**Ethskills:** wallets, orchestration, gas (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Seed script: about fifty leaves across the manual writer and the detector key, categories 1, 3, 6, 7, one category 8 leaf, one tombstone of an own leaf, one counter of the other writer's leaf, one dispute. Manual writer through `append`; detector through `appendSigned` via the relayer. Batches capped at 500.
- [ ] Relayer script: separate funded key, submits `appendSigned`, drops a batch whose deadline has passed instead of paying for a revert. The detector key holds no ETH.
- [ ] Manual writer, relayer, and the demo account are funded from a faucet; the runbook lists the three addresses and the faucet. Keys and RPC URLs come from an ignored env file or keystore.
- [ ] Transaction hashes of the seed batches recorded in Comments; explorer shows the `Appended` events.
- [ ] A read of the writer sequences after seeding matches the leaf counts the script sent.
