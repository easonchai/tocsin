# 09: Detector

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Demo infrastructure, detector and relayer. PRD: `erc/eip-draft_threat_flag_log.md`, Categories, category 1 and the forged-evidence bullet. HANDOFF step 5.

**What to build:** A Node process watches new Sepolia blocks, spots dust transfers to lookalike addresses, and within the hour the log carries category 1 leaves from the detector key with the dust transaction as evidence, submitted by the relayer. The detector key never holds ETH.

**Blocked by:** 06 (Seed the Sepolia log and the relayer)

**Ethskills:** indexing, wallets, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Watches new blocks for sub-threshold value transfers to addresses whose prefix and suffix match a recent counterparty of the receiver; resolves the authorizer (UserOperation sender when the target is an EntryPoint), never the bundler.
- [ ] Batches category 1 leaves with the dust transaction hash as evidence, signs `Append` with a one-hour deadline and the current nonce, hands the batch to the relayer. Fixed leaves-per-hour cap.
- [ ] The subject's role is established by a transaction the subject authorized or a transfer from it, never from an event's `from` or `to` field alone.
- [ ] Runs from a fresh clone with only the env file; the detector key comes from that file and holds no ETH.
- [ ] One relayed batch from a live run is visible on the explorer with its hash recorded in Comments, and the reader from ticket 07 evaluates one of its subjects as `warn` under the default list.
