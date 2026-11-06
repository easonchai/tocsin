# 02: Signature and leaf boundaries

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, boundaries and EIP-7702 paragraphs. PRD: `docs/spec/threat-flag-log.md`, Leaf and Interface sections.

**What to build:** Every accept/reject pair at the contract's boundaries, each as its own test, so a reviewer can point at one test per rule the spec states. A batch that is valid on one side of each boundary lands; the same batch one step past it reverts.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** testing, security, standards (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Leaf rules: op 3 accepted and op 4 rejected; evidence zero rejected on a flag and accepted on a tombstone; dispute with subject equal to the writer accepted and not equal rejected.
- [x] Signed-batch rules: deadline equal to the block timestamp accepted and one second past rejected; nonce equal to stored accepted and stored plus one rejected; high-s signature rejected; 64-byte signature rejected.
- [x] ERC-1271 writer: a contract writer returning the wrong magic value is rejected; a contract writer whose `isValidSignature` reverts is rejected; a contract writer returning the right magic value is accepted.
- [x] EIP-7702 writer, set up with `vm.etch` of `0xef0100` plus the delegate address: with a delegate implementing `isValidSignature` the batch is accepted; with a delegate that does not, the batch is rejected even though the EOA key signed.
- [x] Domain separator equals a test-side EIP-712 computation on the default chain and changes after `vm.chainId` to another value; a signature made under the first chain id is rejected under the second.
- [x] A 7702 sentence is added to the spec's Typed signatures rationale as the spec's Further notes describe,.

## Comments

- 2026-11-06: Done. `test/Boundaries.t.sol` has 20 tests, one per rule, named `test_<group>_<rule>_<accepted|rejected>`. An accepted batch is checked by recomputing the writer head from the spec's leaf-hash formula, and every rejection asserts the exact reason string. Each rejected batch is the accepted one moved a single step, as the testing ethskill asks. Three rejections also carry a control that proves the cause. The high-s twin still recovers to the signer under `ecrecover`, so only the low-s rule can reject it. The 64-byte EIP-2098 form fails while the same signature at 65 bytes lands. A signature from the other chain lands once the chain id is switched back. The dispute pair runs through a relayer, so a check against `msg.sender` instead of the writer would fail it. The nonce pair first moves the stored nonce to 1. forge 1.9.0 follows the 7702 designator under the pinned `cancun` evm version (the trace shows `isValidSignature` running on the EOA), so neither `foundry.toml` nor inline config needed a change. Both 7702 tests also pass with `--evm-version prague`. The spec sentence went into the Typed signatures rationale. Full `forge test`: 37 passed.
