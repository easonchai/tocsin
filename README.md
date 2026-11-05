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

Writers pay. Readers pay nothing but bandwidth. A flag in a batch costs about 10,000 gas, almost all of it the event the contract emits; the calldata is a small part. A flag sent on its own costs about 52,000 gas because of the fixed transaction overhead, so writers should batch and wait for a cheap block.

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

## Website

The landing page and ERC draft live in `site/`. Preview from the repo root with `python3 -m http.server 8732` and open `/site/`.

To publish on ENS and IPFS (served at https://tocsin.eth.limo):

```
./site/build.sh                      # self-contained dist/ with relative paths
ipfs add -r --cid-version 1 dist     # or upload dist/ to web3.storage, Pinata, or Fleek
```

Then set the `tocsin.eth` contenthash to `ipfs://<CID>` in the ENS manager. eth.limo resolves it with no further setup.

Links in `site/index.html` marked `TODO` are placeholders: the demo URL, the Telegram group, and the X handle.
