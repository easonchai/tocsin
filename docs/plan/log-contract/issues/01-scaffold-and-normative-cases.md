# 01: Scaffold, reference contract, normative cases 1 to 9

Spec: `docs/plan/log-contract/spec.md`. PRD: `erc/eip-draft_threat_flag_log.md`.

**What to build:** A Foundry package in which the ERC's reference implementation compiles unchanged, answers ERC-165, and passes the nine normative test cases from the ERC's Test Cases section. Someone cloning the repo runs the Foundry test command and sees nine green tests named after the case numbers.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Scaffold-ETH 2 Foundry flavour at the pinned create-eth version, forge at or above the HANDOFF minimum, compiler 0.8.28 with optimizer settings recorded in the Foundry config.
- [ ] Contract source equals the ERC's Reference Implementation section, with state variables in the ERC's order, no OpenZeppelin, no renames. The ERC's Interface section is extracted as a separate interface file and the contract implements it.
- [ ] ERC-165 added to the contract and to the ERC's reference section in the same commit. The interface id is computed from the extracted interface. `site/erc.html` rebuilt and shows no further diff against the markdown.
- [ ] Nine tests, one per ERC Test Case 1 to 9, each named after its case number, all passing.
- [ ] No test asserts stored state against the value just written or a constant against itself.
- [ ] Deployer key and RPC URL are read from an ignored env file or Foundry keystore; nothing in the package carries a key, token, or keyed RPC URL.
