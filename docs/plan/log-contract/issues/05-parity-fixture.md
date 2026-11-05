# 05: Parity fixture for the reader

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, fixture line; `docs/plan/demo/spec.md`, reader parity test. PRD: `erc/eip-draft_threat_flag_log.md`, Test Cases (the missing test vectors).

**What to build:** A Foundry test that runs a fixed scenario and writes a JSON file the demo reader's parity test loads. The file carries everything a reader needs to recompute every hash from scratch, including the append block number, which the event does not carry.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** testing (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Fixed scenario with at least two writers, both entry points, every op, a tombstone referencing an own leaf, a counter referencing another writer's leaf, and appends spread over several blocks via `vm.roll`.
- [x] The test writes a JSON file under the Foundry package containing, per leaf: writer, append block number, writer sequence, global sequence, the leaf fields, leaf hash, writer head after, global head after; plus the final heads and sequences.
- [x] The file is tracked in git and regenerates byte-identical on a second run.
- [x] The file's path is named in the log-contract spec's Testing decisions so the demo reader ticket can find it.

## Comments

- 2026-11-06: Done. `test/Fixture.t.sol` writes `fixtures/parity.json`: 12 leaves from two writers over blocks 9000000, 9000001, 9000004, 9000010 and 9000011, with the timestamp pinned at 1790000000. Alpha calls `append` three times. Beta signs two batches that a relayer submits through `appendSigned`. Categories 1 to 8 all appear, and chainId 0 shows up only in 1, 2, 6 and 8. Alpha tombstones its own category 3 flag, beta counters alpha's category 1 flag, and beta disputes a flag on itself. The log sits at the predicted Sepolia CREATE2 address `0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865` (via `deployCodeTo`, chainid 11155111), so the fixture's domain separator matches that deployment. Each signed batch records its deadline, nonce, digest and signature. Before writing, the test recomputes every leaf hash and both heads from the leaf inputs and checks them against the events and the stored final state. All integers are decimal strings, and object keys come out sorted, as the top-level `format` note says. Two runs gave the same sha256, `31dc7eb5f78a9407b5430443882469778eccfe6170b869c3c532872a1d9b37e7` both times. The file is not gitignored and lands with this ticket's commit. Full `forge test`: 39 passed.
