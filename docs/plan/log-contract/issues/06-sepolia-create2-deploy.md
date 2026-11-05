# 06: CREATE2 deploy to Sepolia with verify and smoke append

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment. PRD: `erc/eip-draft_threat_flag_log.md`, Deployment section. HANDOFF step 2. Sepolia only; mainnet is deferred.

**What to build:** One command deploys the log to Sepolia at the address the ERC's deployment method predicts, verifies the source on Sourcify and Etherscan, and sends one flag as a smoke test. Judges open the explorer and see verified source and the first `Appended` event.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9), 02 (Signature and leaf boundaries)

**Ethskills:** orchestration, wallets, gas (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Deploy script computes the CREATE2 address from the deterministic deployment proxy, salt zero, and the compiled init code with no constructor arguments; prints it; aborts if code already exists there.
- [ ] Deployer key comes from a Foundry keystore or an ignored env file; the RPC URL comes from the environment. Nothing in the repo carries either. Go/no-go before broadcasting: tests from 01 and 02 pass and the deployer address shows a Sepolia balance.
- [ ] The deployed address equals the predicted address.
- [ ] Sourcify and Etherscan verification run in the same step as the deploy and both show the source.
- [ ] Smoke test: one `append` of a single flag leaf from the deployer key, then reads of writer sequence equal to 1 and global sequence equal to 1, with the transaction hash recorded in the ticket's Comments.
