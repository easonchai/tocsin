# 01: Scaffold, reference contract, normative cases 1 to 9

Spec: `docs/plan/log-contract/spec.md`. PRD: `docs/spec/threat-flag-log.md`.

**What to build:** A Foundry package in which the spec's reference implementation compiles unchanged, answers ERC-165, and passes the nine normative test cases from the spec's Test Cases section. Someone cloning the repo runs the Foundry test command and sees nine green tests named after the case numbers.

**Blocked by:** None (can start immediately)

**Ethskills:** ship, tools, testing, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Scaffold-ETH 2 Foundry flavour at the pinned create-eth version, forge at or above the HANDOFF minimum, compiler 0.8.28 with optimizer settings recorded in the Foundry config.
- [x] Contract source equals the spec's Reference Implementation section, with state variables in the spec's order, no OpenZeppelin, no renames. The spec's Interface section is extracted as a separate interface file and the contract implements it.
- [x] ERC-165 added to the contract and to the spec's reference section in the same commit. The interface id is computed from the extracted interface.
- [x] Nine tests, one per spec Test Case 1 to 9, each named after its case number, all passing.
- [x] No test asserts stored state against the value just written or a constant against itself.
- [x] Deployer key and RPC URL are read from an ignored env file or Foundry keystore; nothing in the package carries a key, token, or keyed RPC URL.

## Comments

- 2026-11-06: Done. Package at `dapp/packages/foundry` (create-eth 2.0.23, `-s foundry`), forge 1.9.0, solc 0.8.28, evm `cancun`, optimizer on, 200 runs. `contracts/ThreatFlagLog.sol` and `contracts/IThreatFlagLog.sol` diff clean against the spec's Reference Implementation and Interface blocks. The contract cannot inherit the interface without redeclaring `Leaf` and `Appended`, so the tests call it through `IThreatFlagLog(address(log))`, which fails if the ABI drifts. ERC-165 id `0xffc90efa` is the XOR of the eight interface selectors. `forge test --match-contract NormativeCasesTest`: 9 passed. SE-2's default Alchemy and Etherscan keys were stripped from `.env.example` and `scripts-js/checkAccountBalance.js`; Sepolia RPC reads `SEPOLIA_RPC_URL`.
