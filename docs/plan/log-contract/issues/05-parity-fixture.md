# 05: Parity fixture for the reader

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, fixture line; `docs/plan/demo/spec.md`, reader parity test. PRD: `erc/eip-draft_threat_flag_log.md`, Test Cases (the missing test vectors).

**What to build:** A Foundry test that runs a fixed scenario and writes a JSON file the demo reader's parity test loads. The file carries everything a reader needs to recompute every hash from scratch, including the append block number, which the event does not carry.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Status:** ready-for-agent

- [ ] Fixed scenario with at least two writers, both entry points, every op, a tombstone referencing an own leaf, a counter referencing another writer's leaf, and appends spread over several blocks via `vm.roll`.
- [ ] The test writes a JSON file under the Foundry package containing, per leaf: writer, append block number, writer sequence, global sequence, the leaf fields, leaf hash, writer head after, global head after; plus the final heads and sequences.
- [ ] The file is tracked in git and regenerates byte-identical on a second run.
- [ ] The file's path is named in the log-contract spec's Testing decisions so the demo reader ticket can find it.
