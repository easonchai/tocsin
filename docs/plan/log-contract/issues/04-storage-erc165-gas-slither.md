# 04: Storage layout, ERC-165, gas snapshot, slither

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, storage, ERC-165, gas, and slither lines. PRD: `erc/eip-draft_threat_flag_log.md`, Storage layout and ERC-165 sections; HANDOFF, Gas.

**What to build:** The checks a reader and a reviewer rely on without reading the contract. Raw storage reads prove the normative slot formulas, the ERC-165 answer is pinned, the gas figure the README quotes is reproducible from a snapshot, and static analysis is clean.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Status:** ready-for-agent

- [ ] `vm.load` at slots 0 and 1 and at the ERC's two mapping formulas for two different writers, plus the nonce mapping at slot 4, each matching the value the getters return after appends.
- [ ] ERC-165 returns true for the log interface id, true for the ERC-165 id, false for a random id.
- [ ] A hundred-leaf batch recorded with Foundry's gas snapshot and committed, so the README's per-flag figure can be re-derived.
- [ ] Slither runs on the package with no high or medium finding left unaddressed; any accepted finding is explained in the ticket's Comments.
