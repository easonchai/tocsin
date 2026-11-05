# 08: ERC-7730 clear-signing descriptor

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment, ERC-7730 bullet. PRD: `erc/eip-draft_threat_flag_log.md`, Interface, ERC-7730 bullet (added in v2.1).

**What to build:** A writer signing a batch from a hardware device or a Safe sees each subject, the category name, and the op name on the device, not a hash. The descriptor file that makes this possible is in the repo, validates, and names the Sepolia deployment.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** standards, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] One ERC-7730 JSON file with a calldata format for `append` and `appendSigned` and an EIP-712 format for the `Append` typed data in the `ThreatFlagLog` version `1` domain, every leaf field displayed.
- [ ] `category` and `op` display by name through enums that equal the ERC's tables: categories 1 to 8 as named there, ops FLAG, TOMBSTONE, COUNTER, DISPUTE.
- [ ] The deployments list names Sepolia and the CREATE2 address the deploy script predicts.
- [ ] The file passes the ERC-7730 schema check, and the command used is recorded in the ticket's Comments.
