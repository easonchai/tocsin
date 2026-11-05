# Tocsin

Herd immunity for Ethereum. An append-only log of scam infrastructure that lives in Ethereum state, that anyone can write to under their own name, and that a wallet can check through a light client without trusting an RPC, an explorer, or a security vendor.

This repo holds the ERC draft and a landing page that explains it. The wallet is being built during ETHGlobal Mumbai, 5 to 7 November 2026, and will land in its own folder.

## The problem

Every wallet decides whether an address is dangerous by asking a company. Some keep their own list. Most pull from Etherscan, Blockscout, Blockaid, or ScamSniffer over an API. Either way the user cannot verify the answer, and the company learns every address the user checks. This Devcon is full of talks about light clients and anonymous RPCs because access to Ethereum is still centralised. Security is the part nobody has moved yet.

The one on-chain address list Ethereum ever had, the Chainalysis sanctions oracle, stopped updating in March 2026 when its owner lost interest. It died because it had an owner.

## The idea

A singleton contract on mainnet with no owner, no pause, no upgrade, and no delete. Anyone appends flags about addresses, but only into their own namespace. The contract hashes every flag into the writer's chain, so nothing can be removed or rewritten, not by us, not by the writer. Corrections are new entries.

The log says nothing about who to believe. That is the reader's choice. A trust list is a signed, versioned set of writers with weights and block ranges, published under an ENS name by whoever maintains it. A wallet pins the lists it wants. One listed writer warns. Two independent writers block. The user can always override on the device, and nobody is told.

The read path is built for a wallet that trusts nothing it is told. Prove the heads of the writers your lists name with one storage proof against a light-client-verified state root, download those writers' entries from anyone at all, replay the chain, and check every address locally. If the data does not hash to the proven head, the wallet says unverifiable and never says clean. No per-address query ever leaves the device.

We do not chase throwaway lookalike addresses. About one in nine thousand is ever paid, and a local prefix and suffix check catches them better than any list. We remember what attackers reuse for years: the operators that plant the dust, the funders behind them, drainer receivers and spenders, malicious delegates, malicious tokens, and lookalikes that actually got paid.

## What is here

| Path | What it is |
| --- | --- |
| `erc/eip-draft_threat_flag_log.md` | The ERC draft, in the EIP-1 format the editors lint against |
| `site/index.html` | Landing page. Static, no external requests, fonts bundled |
| `site/erc.html` | The ERC rendered as a page, generated from the markdown |
| `scripts/build-erc.mjs` | Regenerates `site/erc.html` after you edit the ERC |
| `HANDOFF.md` | Current state, decisions, and the build order for anyone picking this up |
| `docs/wallet-integrations.md` | Feature request for the Kohaku module, MetaMask Snap, and provider-proxy extension |
| `dapp/packages/foundry` | The log contract, its Foundry tests, and the CREATE2 deploy script (Scaffold-ETH 2, Foundry flavour) |
| `GLOSSARY.md` | Log, writer, leaf, subject, head, maintainer, reader |

## Who calls the log

The log has two state-changing functions and no others. Nothing in it runs on a schedule.

| Transition | Caller | Why they pay gas | If nobody calls |
| --- | --- | --- | --- |
| `append(leaves)` | The writer, from its own account | Its flags only reach wallets through the lists that name it, so publishing is its distribution | Nothing changes. The heads stay where they are and readers keep the last state they proved |
| `appendSigned(writer, leaves, deadline, nonce, sig)` | Any relayer | The writer sponsors the relayer, or runs its own, so its signing key never holds gas | The signed batch expires at its deadline and the writer's nonce is untouched, so the writer re-signs or sends `append` itself |

Nobody can stop a writer: a relayer that refuses a batch is bypassed by sending `append` directly.

## Test and deploy the log

The contract has no owner, so a deploy hands nothing over afterwards. Tests first:

```sh
cd dapp/packages/foundry
forge test
```

Sepolia only for now. The address comes from the deterministic deployment proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C` with salt zero, so it is the same on every chain. For the current build it is `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`. Any edit to the contract or to the compiler settings in `foundry.toml` moves it.

One-time setup:

1. `cd dapp && yarn install`
2. Make a keystore with `cast wallet import <name> --interactive` (or `yarn generate`) and fund its address with Sepolia ETH. Never pass `--private-key`.
3. In `dapp/packages/foundry/.env`, which git ignores, set `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, and `DEPLOYER_KEYSTORE_ACCOUNT=<name>`. `.env.example` lists the names.

Deploy, verify, and smoke-test, from the repo root:

```sh
bash dapp/packages/foundry/scripts-sh/deploy-sepolia.sh
```

The script refuses to start unless the normative and boundary suites pass, the chain id is 11155111, and the predicted address has no code. It prints the address, the deployer, its live balance, the live gas price, and the estimated cost, then waits for you to type `DEPLOY`. It deploys, verifies on Etherscan and Sourcify, and appends one flag from the deployer (category 128, subject the deployer, so it names nobody else). Then it reads `writerSeq(deployer)` and `globalSeq()` back from the chain and expects 1 and 1. If a step after the deploy fails, run the retry commands it prints rather than the script again, because the address is already taken.

To check a deployment yourself:

```sh
cast code 0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14 --rpc-url "$SEPOLIA_RPC_URL" | cast keccak
cast call 0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14 "globalSeq()(uint64)" --rpc-url "$SEPOLIA_RPC_URL"
```

The first should print `0xd9f882ccb806d16653f80dc459f533e23363936675d52e08f9ed7e7ee56a4ea5`, the runtime code hash in the ERC's Deployment section.

For a local chain, SE-2's usual `yarn chain` and `yarn deploy` in `dapp/` deploy to the same address on anvil.

## Run the site

Open `site/index.html` in a browser. It works from the filesystem. If your browser refuses to load local fonts, serve the folder:

```sh
cd site && python3 -m http.server 8731
```

## Rebuild the ERC page

```sh
npm install
node scripts/build-erc.mjs
```

## What a flag costs

Writers pay. Readers pay nothing but bandwidth. A flag in a batch costs about 10,000 gas, almost all of it the event the contract emits; the calldata is a small part. A flag sent on its own costs about 52,000 gas because of the fixed transaction overhead, so writers should batch and wait for a cheap block. The test suite measures a 100-leaf batch at 986,455 gas, or 9,865 a flag, in `dapp/packages/foundry/snapshots/ThreatFlagLog.json` (`forge test --match-contract Gas` regenerates it). That figure uses Cancun gas rules. A Sepolia fork, which runs newer rules, charged a single-leaf append about four times what the test EVM did, so re-measure on Sepolia after the deploy before quoting it.

With ETH at $2,200:

| Base fee | One flag, batched | 50,000 flags a year |
| --- | --- | --- |
| 0.2 gwei, this week's median | under half a cent | about $220 |
| 0.5 gwei | about 1 cent | about $550 |
| 1 gwei | about 2 cents | about $1,100 |
| 10 gwei, a bad hour | about 22 cents | about $11,000 |

The base fee moved fifty-fold within one day this week, so the honest sentence for a pitch is "about half a cent a flag" and not an annual number. Calldata repricing proposed for the Glamsterdam fork would raise the cost of the current encoding by about 40 percent; the ERC notes it and a packed encoding would absorb it.

What a reader downloads is bounded by the writers it pins, not by the age of the chain. Fifty thousand flags a year is about 5 MB packed. A fresh install verifies from a recent anchor and never replays from the beginning.

## CROPS

The Ethereum Foundation's test for the properties Ethereum must keep. Censorship resistant, open source, private, secure.

**C.** Nothing we run sits between the user and the data. The log has no owner and `append` is open to anyone, so a relayer that refuses a writer can be bypassed by sending directly. Entries are verified by replay against a proven head, so any RPC, any mirror, and any snapshot host is interchangeable, and a lying one produces "unverifiable", not a false "clean". Lists are signed by their maintainer and pinned on first use, so losing our ENS name or domain cannot swap a reader's list. A block is always overridable on the device.

**O.** MIT for everything in this repo, CC0 for the ERC. It builds from the repo alone. There is no backend, indexer, or API of ours.

**P.** The RPC sees one storage proof for the writers in the user's lists and bounded log ranges by writer, over the EF's Anon-RPC worker. A mirror sees a writer name and a sequence number. Nobody sees the recipient, the spender, or the user's own address in connection with a check, because every check runs on the device against a locally replayed set. The one read that is not anonymised is the Anon-RPC worker's hash bootstrap, which itself goes through the light client. Helios's consensus endpoint and checkpoint are user-configurable.

**S.** The wallet holds no keys of ours and sends no user data anywhere. Trust assumptions, in order: the sync committee and the pinned weak-subjectivity checkpoint; the maintainers of the lists the user pinned; the writers those lists name, bounded by block ranges. Walkaway test: delete the team, the domain, and every server, and the log, the pinned lists, and the wallet keep working.

## Before the ERC is posted

1. Create the Ethereum Magicians thread and replace the `TODO` in `discussions-to`.
2. Run the backtest. Take the public poisoning and drainer datasets and measure the share of lost dollars that went to an address which would have met the write criteria at least an hour before the loss. Under 10 percent, stop. Over 25 percent, open the PR.
3. Open the PR against `ethereum/ERCs`.

## License

MIT for this repository. CC0 for everything under `erc/`, as the EIP process requires.
