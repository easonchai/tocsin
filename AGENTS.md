## Set up and run

Two paths. Take the first unless the user asks for lists or writers of their own.

- **The demo as committed.** `./demo.sh`, then the beats in `RUNBOOK.md`. Nothing to fund, deploy or configure: the log is live on Sepolia and the three lists are published on their ENS names.
- **Own writers and lists on the shared log.** `./bootstrap.sh`, then `./demo.sh`. Read `docs/agents/bootstrap.md` first: the script stops once for one Sepolia ETH transfer only the human can make, and the doc says how to hand that off and how to verify the result before the browser step.

Loading Kohaku or the Snap in Chrome is the human's step on both paths. Hand it off with the paths `demo.sh` prints and the beats in `RUNBOOK.md`. Its "For agents" section lists every env the script reads; ask the human for any you are not sure about instead of guessing.

## Verify a claim

Every check here runs on a fresh clone with public values and no keys. Run `yarn install` in `dapp/` once.

- **The three beats, no browser.** From `dapp/`, export `RPC_URL=https://0xrpc.io/sep CHAIN_ID=11155111 LOG_ADDRESS=0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14 LOG_FROM_BLOCK=12074077 LIST_DOCUMENT=$PWD/../scripts/seed/data/core.list.json` and `LIST_RECORD` set to that document's `record` field. Then `yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc` prints `verdict block`. Start `yarn workspace @tocsin/infra lying-proxy` with the same env, and `eval 0xe25d04e7a7B357179eBf53b16f4C5304c6818fb9 --source proxy` prints `verdict unavailable, chain mismatch at sequence 93`.
- **The deployed log is the committed source.** `cast code 0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14 --rpc-url https://0xrpc.io/sep | cast keccak` prints the runtime code hash in the spec's Deployment section.
- **Tests.** `forge test` in `dapp/packages/foundry`. `yarn workspace <name> test` for `@tocsin/reader`, `@tocsin/infra`, `@tocsin/extension` and the Snap (its name is in `dapp/packages/snap/package.json`).
- **Judge checks.** The table at the end of `docs/operator.md` maps each prize check to the file, test or command that shows it.

The README's "Trust level of each host" under CROPS lists what each host does not yet prove, such as the Snap and Kohaku taking their header from one RPC. Report a gap listed there as a known limit. A claim is false only when the code contradicts it.

## Ethskills

Before you start a task, load every ethskill whose row matches it. A task that touches several rows, such as contract code plus its tests, loads all of them. You're done with this step when every matching ethskill is in context.

In Claude Code, load `ethskills:<name>` (`why` is `ethskills:why-ethereum`). Other agents fetch `https://ethskills.com/<name>/SKILL.md`.

| Task | Ethskill |
| --- | --- |
| Deciding product scope, chain, or whether to adopt or write an EIP | `why` |
| Building the smart contracts | `ship` |
| Writing contract specs, including `docs/spec/` | `crops`, `protocol` |
| Checking whether an EIP or fork feature is live | `protocol` |
| Estimating or validating gas and dollar costs | `gas` |
| Building the wallet: keys, signing, delegation | `wallets` |
| Citing any EIP or ERC | `standards` |
| Picking a package, library, or version | `tools` |
| Deploying to Sepolia or mainnet, or rehearsing a deploy on a fork | `orchestration` |
| Designing or explaining how something onchain works | `concepts` |
| Security review of contract code | `security` |
| Writing tests | `testing` |
| Reading past onchain activity or adding an indexer | `indexing` |
| Building the frontend demo | `frontend-ux`, `frontend-playbook` |
| QA on the frontend before the demo | `qa` |
| Auditing the contracts | `audit` |

The settled decisions below take precedence over ethskill advice. If they conflict, follow the decision and point out the conflict.

## Settled decisions

- Trust first, privacy second, security is the outcome. Say "verifiable", not "trustless". Never say "composable" (no contract can query the log). Never say "decentralised ScamSniffer" (we replace distribution and trust, not detection).
- ERC-8004 gets one sentence in Related work and nothing in the pitch.
- Read path: prove per-writer heads at storage slots 2 and 3, sync only the pinned writers' entries from any source, verify the suffix from an anchor, never replay from a writer's first entry. The global head at slot 0 is for mirrors.
- Trust lists are EIP-712 signed by a maintainer. ENS locates a list; the signature authenticates it. Readers pin maintainer and version on first use. ENSv2 roles govern who may publish the record, not who may write the log.
- The log has no access control. Writer is `msg.sender` or the EIP-712 or ERC-1271 signer. Anyone writes into their own namespace.
- Gas: about 10,000 gas per flag batched, event-dominated. Say "about half a cent a flag". Glamsterdam calldata repricing is noted in the spec's Rationale, not acted on.
- `chainId = 0` only for categories 1, 2, 6. Category 1 is the authorizer (4337 sender), never the bundler. Category 4's subject is the address after the `0xef0100` designator.
- Blob mode is left to a later revision of the spec.
- No Chainlink CRE. The automated writer is a plain detector script with its own key, listed at warn weight.
- Deploy with CREATE2 through `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt zero, so the address matches on every chain.
- Upstream Kohaku does not route reads through Anon-RPC, so our patch adds it for Tocsin's reads only. Kohaku's own balance, gas and simulation reads still go direct.
- List documents live in `scripts/seed/data/<label>.list.json`. The `tocsin.list` records published before the move still point at the raw GitHub URLs under `docs/plan/demo/seed/`, so copies stay there until `node scripts/ens/setup-all.mjs` republishes each record with the new URL from its maintainer key. Delete `docs/plan/demo/` after that run.

## Vocabulary

Use the terms in `GLOSSARY.md` in code, tests and docs.
