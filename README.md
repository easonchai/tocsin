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
| `docs/plan/demo/runbook.md` | Commands and env var names to seed, relay, detect, mirror, lie, publish lists, and build the Snap and extension, plus where each judge check is shown |
| `dapp/packages/reader` | The reader library every host shares: sync, verify, evaluate, trust lists, ENS |
| `dapp/packages/infra` | Demo scripts: seed, relayer, detector, lying proxy, mirror, three-beat CLI, ENS setup |
| `dapp/packages/snap` | The MetaMask Snap, the primary host |
| `dapp/packages/extension` | The provider-proxy extension with Helios and Anon-RPC |
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

Censorship resistance, open source, privacy, security: the Ethereum Foundation's test for what Ethereum must keep. This section describes the code as it ships on this branch. The log is deployed and verified on Sepolia at `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`. The team's ENS name is not registered yet, so the claims about the list record and the hosts were checked in tests and anvil rehearsals, not on a live chain. `docs/plan/demo/runbook.md` maps each judge check to a file, command, or demo beat.

**Operator powers: none on the log.** `ThreatFlagLog.sol` has two state-changing functions, `append` and `appendSigned`, and no owner, pause, upgrade, allowlist, or delete. Anyone can relay a signed batch, and a writer whose relayer refuses can send `append` itself. Two powers exist off the contract. The ENS name owner can repoint the list record, and the list maintainer can sign a new version. Hosts pin the maintainer on first use. In the Snap, a list signed by a different key opens a confirmation dialog. The extension keeps the old pin and says so on the overlay. A stolen maintainer key can still sign a higher version that hosts accept without asking. The maintainer's ENSv2 publish grant covers every name on its resolver, the writer subnames included.

**What survives the team disappearing.** The log survives because nobody controls it. Every installed host survives because it keeps its pinned list and checkpoints on the device, in Snap state or in `chrome.storage.local`, and reads leaves from any Sepolia RPC and verifies them by replay. The walkaway test in `dapp/packages/snap/test/bundle.test.ts` deletes the team's ENS records, list host, and mirror, and the built Snap still blocks the seeded drainer receiver from the pinned list and the log. The extension falls back to its pin through the same code, without a test of its own. Three things stop. The mirror source fails, because the team serves those files. Writer names fall back to short addresses. A fresh install has nothing to pin until someone serves a list record and its document. The code is MIT and the ERC is CC0. No host talks to a backend, indexer, or API of ours. The only team-run server is the static host for list documents and mirror files, and the reader verifies everything it serves.

**What an observer learns.** No per-subject query leaves the device. Recipients, spenders, and permit spenders are checked inside the host against the replayed set. Evidence links open the explorer only when the user clicks. What does leave:

| Read | Snap | Extension, `tor` or `nym` | Extension, `direct` |
| --- | --- | --- | --- |
| Header, storage proof for the pinned writers only, ENS record and writer names | The RPC set in settings, direct. It sees the user's IP, the log, and the pinned writers | Sepolia Helios. Its execution calls go through the Anon-RPC worker. The consensus server is contacted directly | Sepolia Helios, direct to its RPC |
| Leaves, `eth_getLogs` per pinned writer | The same RPC or the custom URL, direct | Through the Anon-RPC worker | Direct |
| List document at `listURI` | Direct | Direct, not through the worker | Direct |
| Mirror files at `snapshotURI` | Direct, when the source is the mirror | Not read | Not read |
| Worker bootstrap | None | Mainnet Helios, direct. Learns that a light client runs and which worker it loads | None |

The ERC says readers SHOULD fetch list documents over the anonymising transport. The extension does not yet, so the static host learns the user's IP and which list they read.

**Trust level of each host,** as `docs/wallet-integrations.md` defines it, adjusted for what shipped:

- MetaMask Snap, the primary host: best-effort. The header and storage proofs come from the configured RPC and no light client checks them. A lying RPC whose answers agree with each other could forge a head. One whose logs disagree with its proven head produces "cannot vouch", never "clean". The panel says the header is unverified and the RPC is not anonymised. The Snap cannot stop a transaction. It raises MetaMask's critical warning, and the confirm button stays the user's.
- Provider-proxy extension: built for the full claim. Helios checks the header and proofs, and the Anon-RPC worker carries execution reads. It has not run in a real browser yet. It has no settings page and no mirror source. RPCs, transport, and list name are fixed at build time. The override enables after five seconds, on the device, and nobody is told.
- Kohaku module: a diagram only. On Sepolia the fork has no anonymising transport and its light clients fail to verify. See `docs/plan/demo/issues/02-kohaku-hour-one-checks-and-decision.md`.
- The `/harness` page in `dapp/packages/nextjs`: once produced a light-client-verified proof over Nym. Over Tor it reached the RPC once and never completed a proof, because the public demo gateway failed most cold starts. The stage needs our own `tor-js-gateway` or the Nym switch.

Trust assumptions, in order: the sync committee and the pinned weak-subjectivity checkpoint, in the extension only; the RPC, in the Snap; the maintainers of the pinned lists; the writers those lists name, bounded by block ranges.

## Before the ERC is posted

1. Create the Ethereum Magicians thread and replace the `TODO` in `discussions-to`.
2. Run the backtest. Take the public poisoning and drainer datasets and measure the share of lost dollars that went to an address which would have met the write criteria at least an hour before the loss. Under 10 percent, stop. Over 25 percent, open the PR.
3. Open the PR against `ethereum/ERCs`.

## License

MIT for this repository. CC0 for everything under `erc/`, as the EIP process requires.

## Website

The landing page and ERC draft live in `site/`. Preview from the repo root with `python3 -m http.server 8732` and open `/site/`.

To publish on ENS and IPFS (served at https://tocsin.eth.limo):

```
./site/build.sh                      # self-contained dist/ with relative paths
ipfs add -r --cid-version 1 dist     # or upload dist/ to web3.storage, Pinata, or Fleek
```

Then set the `tocsin.eth` contenthash to `ipfs://<CID>` in the ENS manager. eth.limo resolves it with no further setup.

Links in `site/index.html` marked `TODO` are placeholders: the demo URL, the Telegram group, and the X handle.
