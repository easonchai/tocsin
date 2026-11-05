# 02: Signature and leaf boundaries

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, boundaries and EIP-7702 paragraphs. PRD: `erc/eip-draft_threat_flag_log.md`, Leaf and Interface sections.

**What to build:** Every accept/reject pair at the contract's boundaries, each as its own test, so a reviewer can point at one test per rule the ERC states. A batch that is valid on one side of each boundary lands; the same batch one step past it reverts.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** testing, security, standards (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Leaf rules: op 3 accepted and op 4 rejected; evidence zero rejected on a flag and accepted on a tombstone; dispute with subject equal to the writer accepted and not equal rejected.
- [ ] Signed-batch rules: deadline equal to the block timestamp accepted and one second past rejected; nonce equal to stored accepted and stored plus one rejected; high-s signature rejected; 64-byte signature rejected.
- [ ] ERC-1271 writer: a contract writer returning the wrong magic value is rejected; a contract writer whose `isValidSignature` reverts is rejected; a contract writer returning the right magic value is accepted.
- [ ] EIP-7702 writer, set up with `vm.etch` of `0xef0100` plus the delegate address: with a delegate implementing `isValidSignature` the batch is accepted; with a delegate that does not, the batch is rejected even though the EOA key signed.
- [ ] Domain separator equals a test-side EIP-712 computation on the default chain and changes after `vm.chainId` to another value; a signature made under the first chain id is rejected under the second.
- [ ] A 7702 sentence is added to the ERC's Typed signatures rationale as the spec's Further notes describe, and `site/erc.html` is rebuilt.
