# 06: CREATE2 deploy to Sepolia with verify and smoke append

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment. PRD: `erc/eip-draft_threat_flag_log.md`, Deployment section. HANDOFF step 2. Sepolia only; mainnet is deferred.

**What to build:** One command deploys the log to Sepolia at the address the ERC's deployment method predicts, verifies the source on Sourcify and Etherscan, and sends one flag as a smoke test. Judges open the explorer and see verified source and the first `Appended` event.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9), 02 (Signature and leaf boundaries)

**Ethskills:** orchestration, wallets, gas (per AGENTS.md; load before starting)

**Status:** ready-for-human

- [x] Deploy script computes the CREATE2 address from the deterministic deployment proxy, salt zero, and the compiled init code with no constructor arguments; prints it; aborts if code already exists there.
- [x] Deployer key comes from a Foundry keystore or an ignored env file; the RPC URL comes from the environment. Nothing in the repo carries either. Go/no-go before broadcasting: tests from 01 and 02 pass and the deployer address shows a Sepolia balance.
- [ ] The deployed address equals the predicted address.
- [ ] Sourcify and Etherscan verification run in the same step as the deploy and both show the source.
- [ ] Smoke test: one `append` of a single flag leaf from the deployer key, then reads of writer sequence equal to 1 and global sequence equal to 1, with the transaction hash recorded in the ticket's Comments.

## Comments

- 2026-11-06: Built and rehearsed up to the live broadcast. Nobody has broadcast to Sepolia yet.
  - Files: `script/Deploy.s.sol` (rewritten), `script/Smoke.s.sol`, `scripts-sh/deploy-sepolia.sh`, and `DEPLOYER_KEYSTORE_ACCOUNT` added to `.env.example`.
  - Predicted address for the current build: `0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865`. The script recomputes it from `type(ThreatFlagLog).creationCode`, so any change to the contract source or compiler settings moves it. On real Sepolia at block 12071586, `cast code` returned `0x` at that address, and the proxy has code.
  - `Deploy.s.sol` uses a salted `new`, so forge sends one transaction to `0x4e59b44847b379578588920cA78FbF26c0B4956C` with data `salt ++ initcode`. The local rehearsal checked the broadcast input byte for byte. Forge records it as CREATE2, so `--verify` and SE-2's ABI export both find it. The script reverts if the proxy has no code, if code already exists at the prediction, or if the deployed address differs from the prediction.
  - The smoke flag is category 128, writer-defined noise that no reader evaluates without opting in, with the deployer as subject, so it names no third party. It refuses to run twice. The shell script reads `writerSeq(deployer)` and `globalSeq()` back from the chain after the broadcast, because the script's own asserts only run in simulation. `globalSeq() == 1` holds only if nobody appends between the deploy and the smoke, and the run reports it as a failure otherwise.
  - Rehearsal 1, plain anvil: the `yarn deploy` path for `Deploy.s.sol` with the `scaffold-eth-default` keystore deployed at the predicted address, 893,901 gas. A second run reverted with "code already exists", and a run with the proxy code removed reverted with "proxy has no code". The smoke gave writerSeq 1 and globalSeq 1, and a second smoke reverted.
  - Rehearsal 2, anvil fork of Sepolia at block 12071578, running the full `deploy-sepolia.sh` with a temporary keystore of anvil's public dev key, since deleted: the gate passed (NormativeCasesTest 9 passed, BoundariesTest 20 passed). The deploy landed at the predicted address, tx `0x4665b857...`, and the smoke landed in tx `0xa96be74d...` with writerSeq 1 and globalSeq 1. Fork runtime code hash: `0xdc59334640b4a42e076253a531f923cb65fa6e1091f535da8ff17ce74c24b93c`. Etherscan and Sourcify verification failed as expected, because the fork's contract does not exist on real Sepolia. The script carried on, listed the failed steps, and exited 1. Refusals checked: code already at the address, unset env var, `scaffold-eth-default` key, wrong chain id, a missing test suite, and any answer other than `DEPLOY`.
  - Gas on Sepolia is much higher than in the test EVM. The fork runs Amsterdam rules. The deploy used 6,195,337 gas there against 893,901 on plain anvil, and live Sepolia `eth_estimateGas` returned 6,292,964 for the same call, so the real chain agrees. A one-leaf append used 466,147 gas on the fork against 119,815 in the snapshot. The cost is still negligible at the 21 wei gas price measured today, but HANDOFF's "about 10,000 gas per flag" was measured under cancun rules and should be rechecked on Sepolia after the deploy.
  - `forge script --verify` on forge 1.9.0 also submitted to Sourcify by itself, so the explicit Sourcify step may report the contract as already verified.
  - The human runs, once: `yarn install` in `dapp/`, then `yarn generate` or `cast wallet import <name> --interactive` to make a keystore, fund its address with Sepolia ETH, and put `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, and `DEPLOYER_KEYSTORE_ACCOUNT=<name>` in `dapp/packages/foundry/.env`. Then, from the repo root:

    ```
    bash dapp/packages/foundry/scripts-sh/deploy-sepolia.sh
    ```

    It prints the predicted address, deployer, live balance, live gas price, and estimated cost, then waits for you to type `DEPLOY`. It asks for the keystore password up to three times, unless `ETH_PASSWORD` points at a password file. If a step after the deploy fails, do not rerun the script, because the address is taken. Run the retry commands it prints instead. Afterwards, record the deploy and smoke tx hashes here and tick boxes 3 to 5.
