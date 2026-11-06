# Operator runbook

To run the demo, use `RUNBOOK.md` at the repo root: one script starts Kohaku, the Snap and every server. This file is for the operator side: keys, deploy, seed, lists, ENS, the detector, and the two hosts without a package README.

Everything a fresh clone needs to stand up the demo on Sepolia, in order. Every command was checked against the `scripts` in the package it names. Run `yarn install` once in `dapp/` first. Commands start in `dapp/` unless a step says otherwise.

No value in this file is secret, and none should be added. Keys live in git-ignored env files or a Foundry keystore. A keyed RPC URL is a secret too: it goes only in an ignored env file, never in a ticket, a chat, or a commit. A key that shows up anywhere else is burned; make a new one.

## Keys, addresses, and funding

Make a fresh key for each role with `cast wallet new`, or `cast wallet import <name> --interactive` for a keystore. Never reuse an anvil key: the anvil dev accounts carry EIP-7702 delegations on Sepolia.

| Role | Sepolia address | Needs Sepolia ETH | Where the key goes | What it does |
| --- | --- | --- | --- | --- |
| Deployer and ENS name owner | `0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31` | Yes | `ENS_OWNER_PRIVATE_KEY` in `packages/infra/.env`, imported as the Foundry keystore `tocsin-deployer` that `DEPLOYER_KEYSTORE_ACCOUNT` names | Deploys the log once through CREATE2, registers the team's name, runs `ens-setup` |
| Manual writer | `0x1D3B86A924ffb140bdD74Ee6a7533921ed141583` | Yes, funded address 1 | `MANUAL_WRITER_PRIVATE_KEY` in `packages/infra/.env` | Sends `append` for the team's manual flags |
| Relayer | `0x7Bae2bbcEC2c9424aCCBB6a7EB43301D8Cc92C98` | Yes, funded address 2 | `RELAYER_PRIVATE_KEY` in `packages/infra/.env` | Pays gas for the detector's `appendSigned` batches |
| Demo account | `0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca` | Yes, funded address 3 | MetaMask Flask, never on disk | The wallet the demo sends from |
| Detector | `0xe3a9678eD0992416C5230f52E3B1fF9775CCA999` | Never | `DETECTOR_PRIVATE_KEY` in `packages/infra/.env` | Signs batches only. The scripts warn if it holds ETH |
| List maintainer | `0x606EE24A4E6E3919FF90B1fD3d2649710Fd99DE1` | Yes, for `ens-publish` | `MAINTAINER_PRIVATE_KEY` in `packages/infra/.env` and `packages/reader/.env` | Signs the list and publishes its record |

The spec's three funded addresses are the manual writer, the relayer, and the demo account. The deployer and the maintainer need gas too. About 0.05 ETH each is plenty, and the deployer needs about 0.1 for the deploy plus `ens-setup`. The deployer and the ENS owner share a key because both are one-time admin roles. Keep the others apart: the scripts refuse a relayer equal to the detector, and the maintainer's narrow `setText` grant is an ENS judge check.

Faucet: the Google Cloud Web3 faucet at https://cloud.google.com/application/web3/faucet/ethereum/sepolia. Fallback: the PoW faucet at https://sepolia-faucet.pk910.de.

The infra scripts read raw keys from `packages/infra/.env` only. They do not take a keystore. `publish-list` takes either.

## Env files

Each package documents its names in a committed `.env.example`. Copy it to the ignored file and fill it in.

| Ignored file | Names |
| --- | --- |
| `packages/foundry/.env` | `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `DEPLOYER_KEYSTORE_ACCOUNT` |
| `packages/infra/.env` | `RPC_URL`, `CHAIN_ID=11155111`, `LOG_ADDRESS`, `MANUAL_WRITER_PRIVATE_KEY`, `DETECTOR_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `LIST_RECORD`, `LIST_DOCUMENT`, `LOG_FROM_BLOCK`, `LOG_BLOCK_RANGE`, `PROXY_URL`, `PROXY_PORT`, `PROXY_DROP_WRITER`, `PROXY_DROP_SEQ`, `ENS_NAME`, `ENS_OWNER_PRIVATE_KEY`, `ENS_WRITERS`, `ENS_MAINTAINER`, `MAINTAINER_PRIVATE_KEY`, and the optional `DETECTOR_PREFIX_HEX`, `DETECTOR_SUFFIX_HEX`, `DETECTOR_DUST_WEI`, `DETECTOR_DUST_TOKEN_UNITS`, `DETECTOR_LEAVES_PER_HOUR`, `DETECTOR_FLUSH_SECONDS`, `DETECTOR_FROM_BLOCK` |
| `packages/reader/.env` | `MAINTAINER_PRIVATE_KEY` or `MAINTAINER_ACCOUNT`, never both; `TOCSIN_MAINTAINER`, `TOCSIN_MANUAL_WRITER`, `TOCSIN_DETECTOR_WRITER`, `TOCSIN_SITE_BASE_URL`, `TOCSIN_OPERATOR_NAME` |
| `packages/nextjs/.env.local` | `NEXT_PUBLIC_HARNESS_SEPOLIA_CONSENSUS_RPC`, `NEXT_PUBLIC_HARNESS_SEPOLIA_EXECUTION_RPC`, `NEXT_PUBLIC_HARNESS_MAINNET_CONSENSUS_RPC`, `NEXT_PUBLIC_HARNESS_MAINNET_EXECUTION_RPC`, `NEXT_PUBLIC_HARNESS_TOR_GATEWAYS`, `NEXT_PUBLIC_HARNESS_WRITERS`. The keyless public defaults are in `.env.example`. The extension build reads this file too |

The Snap and extension builds read their own `TOCSIN_*` settings from the shell, listed in their steps. Whatever they read is bundled into `dist/`, so give them keyless RPC URLs only.

## 1. Deploy the log

Follow "Test and deploy the log" in the README. In short, from the repo root:

```sh
bash dapp/packages/foundry/scripts-sh/deploy-sepolia.sh
```

It prints the predicted address `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14` and waits for you to type `DEPLOY`. Put that address in `LOG_ADDRESS`. The deploy block is the `blockNumber` of the receipt in `dapp/packages/foundry/broadcast/Deploy.s.sol/11155111/run-latest.json`. It goes in `LOG_FROM_BLOCK`, and later in `TOCSIN_LOG_FROM_BLOCK` for both hosts.

Done on 2026-11-06: the log is at the predicted address, deployed in block 12074077, verified on Sourcify and Etherscan, smoke-tested. Hashes are in log-contract ticket 06. On the public RPC, the script's Etherscan and smoke steps failed because the node lagged behind the deploy. If that happens, don't rerun the script. Wait a block and run the retry commands it prints from `dapp/packages/foundry`.

## 2. Seed

Needs `RPC_URL`, `CHAIN_ID`, `LOG_ADDRESS`, and the three writer and relayer keys in `packages/infra/.env`.

```sh
yarn workspace @tocsin/infra test
yarn workspace @tocsin/infra seed
```

Check the printed chain, log, balances, and gas price, then type `SEED`. It sends 50 leaves in 3 transactions and writes `packages/infra/seed-manifest.11155111.json`. If it stops partway, read the printed hashes before rerunning it, because a rerun resends the first manual batch.

The seeded subjects come from fixed labels, so they are the same on every chain:

| Subject | Address | Expected verdict |
| --- | --- | --- |
| Drainer receiver, category 3 | `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537` | `block` as recipient |
| Drainer spender, category 7 | `0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e` | `block` as permit or approve spender |
| Theft proceeds, category 8 | `0xCd2698C9c9b2b69625DD2a56252190647F34913d` | `warn` as recipient, by the ERC's category 8 cap |

## 3. Trust list and mirror

Pick the static host first. It serves `site/`, and the list document and mirror files live under `TOCSIN_SITE_BASE_URL`. It must send `access-control-allow-origin: *`, because the Snap and the extension fetch cross-origin. `python3 -m http.server` does not send that header.

Set the `TOCSIN_*` names in `packages/reader/.env`. `TOCSIN_OPERATOR_NAME` is the team's ENS name. Then:

```sh
yarn workspace @tocsin/reader publish-list fill "$PWD/../site/lists/default.template.json" "$PWD/../site/lists/default.json"
yarn workspace @tocsin/infra mirror
yarn workspace @tocsin/reader publish-list sign "$PWD/../site/lists/default.json" "<TOCSIN_SITE_BASE_URL>/lists/default.json" > list-record.hex
```

`mirror` writes `site/mirror/<writer>.json` for both writers in the seed manifest and refuses to write a short snapshot. Commit `site/lists/default.json` and `site/mirror/*.json`, deploy `site/`, and check that both `snapshotURI` values in the list answer. Put the contents of `list-record.hex` in `LIST_RECORD`. It is not secret.

The detector appends on its own schedule, and each new leaf makes the detector's mirror file stale. Rerun `mirror` and redeploy `site/` right before the demo.

## 4. ENS name and list record

The owner registers the team's name at sepolia.app.ens.domains first. If the app will not take payment, ticket 08's Comments give the `cast` path through `MockUSDC` and the ETHRegistrar. Then set `ENS_NAME`, `ENS_OWNER_PRIVATE_KEY`, `ENS_WRITERS=manual=<address>,detector=<address>`, `ENS_MAINTAINER`, and `MAINTAINER_PRIVATE_KEY` in `packages/infra/.env`.

```sh
yarn workspace @tocsin/infra ens-setup
yarn workspace @tocsin/infra ens-publish list - < list-record.hex
```

`ens-setup` deploys the permissioned resolver and the user registry, mounts the subregistry, registers `manual` and `detector` as subnames with their addresses, grants the maintainer `setText` on the two list keys, and sets the manual writer's reverse name. A second run reuses what exists. `ens-publish` sends from the maintainer key. Paste every printed hash into ticket 08's Comments.

## 5. Relayer and detector

The relayer runs inside `seed` and `detect`. For a signed batch file on its own:

```sh
yarn workspace @tocsin/infra relay <signed-batch.json>
```

It exits 0 when sent, 2 when it drops the batch without sending, and 1 on error. It drops a batch that names another log or chain, expires within 30 seconds, carries a stale nonce, or fails simulation.

The detector, in its own terminal:

```sh
yarn workspace @tocsin/infra detect
```

It needs `DETECTOR_PRIVATE_KEY` and `RELAYER_PRIVATE_KEY`. For the demo set `DETECTOR_PREFIX_HEX=3` and `DETECTOR_SUFFIX_HEX=3`, because a 4 and 4 lookalike takes about 2^32 tries to grind. Ticket 09's Comments list the `cast` steps that plant a lookalike dust transfer for it to catch. Send them from keystore accounts with `--account`, not `--private-key`.

## 6. The three beats at the command line

In one terminal:

```sh
yarn workspace @tocsin/infra lying-proxy
```

It listens on `127.0.0.1:8550` and drops the manual writer's `Appended` log at sequence 1, the drainer receiver flag. Then:

```sh
yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc
yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source proxy
yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source mirror
yarn workspace @tocsin/infra eval 0xCd2698C9c9b2b69625DD2a56252190647F34913d --source rpc --context recipient
```

Expect `block`, then `unavailable, chain mismatch at sequence 1`, then `block`, then `warn`.

## 7. The Snap and Kohaku

Both are in the root `RUNBOOK.md`: `./demo.sh` builds them with the public defaults and starts their servers.

## 8. The extension

```sh
TOCSIN_LIST_NAME=<team name> TOCSIN_LOG_FROM_BLOCK=<deploy block> yarn workspace @tocsin/extension build
yarn workspace @tocsin/extension test
```

`TOCSIN_TRANSPORT` is `tor` by default. Set it to `nym`, or to `direct` if the venue network blocks both. `direct` is not anonymised and the overlay says so. `TOCSIN_LIST_RECORD` works as in the Snap. The RPC and consensus endpoints come from `packages/nextjs/.env.local`. The Sepolia execution RPC depends on the transport, as in step 9. Rebuild after changing it, because the build bakes it in. Tor needs the local gateway running (`./demo.sh` starts it, or run `tor-js-gateway` yourself) and `NEXT_PUBLIC_HARNESS_TOR_GATEWAYS=127.0.0.1:12298:<the certhash it prints>` in `packages/nextjs/.env.local`. Load `packages/extension/dist` unpacked at `chrome://extensions`. Ticket 13's Comments give the acceptance steps.

## 9. The harness page

```sh
yarn start
```

Open http://localhost:3000/harness. It boots Helios, bootstraps the Anon-RPC worker through it, and proves `writerHead` and `writerSeq` for the writers in `NEXT_PUBLIC_HARNESS_WRITERS`. Tor needs the local gateway and the `NEXT_PUBLIC_HARNESS_TOR_GATEWAYS` setting as in step 8. Keep Nym as the live switch.

Set the Sepolia execution RPC by transport (`NEXT_PUBLIC_HARNESS_SEPOLIA_EXECUTION_RPC`, or the field on the page):

| Transport | Sepolia execution RPC | Why |
| --- | --- | --- |
| Tor | `https://0xrpc.io/sep` | Tenderly answers Tor exits with 403 |
| Nym | `https://sepolia.gateway.tenderly.co` | the Nym worker drops request headers, and 0xrpc.io answers 415 without a content-type |
| direct | `https://0xrpc.io/sep` | serves finalized proofs |

## 10. Live walkaway test

Run after steps 1 to 4 and 7. The offline version is the `walkaway` test in `packages/snap/test/bundle.test.ts`.

1. On the Snap's home page, press Sync now, and check that the drainer receiver is blocked.
2. Take the team away. Clear the `erc-threat-flag-log.list` text record on the team's name at sepolia.app.ens.domains, and take `site/` offline.
3. Press Sync now. Check that the list card reads "Last check: stale", the maintainer is unchanged, and no writer row is in warning.
4. Send to `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537` and check for "Blocked" with the writer shown as a short address.
5. Repeat with the extension: reload it, wait for sync, and send from a page console as in ticket 13, step 6.
6. Restore with `yarn workspace @tocsin/infra ens-publish list - < list-record.hex` and redeploy `site/`.

## Judge checks

From the spec's "Judge checks, by prize". Written when Kohaku was still a diagram; Kohaku now carries the Anon-RPC and ENS checks too (HANDOFF, "Kohaku state").

| Check | Where it is shown | State |
| --- | --- | --- |
| Anon-RPC: worker bootstrapped through Helios, hash checked by the light client | `bootstrapAnonRpc` in `packages/nextjs/utils/harness/anonHelios.ts`. The `/harness` page log prints the matched hash. The extension's `src/offscreen.ts` calls the same function | Ran on the harness page over Tor and Nym. Not yet run in the extension |
| Anon-RPC: transport in use is visible | The `/harness` page names the transport that served each read. The extension overlay prints "RPC traffic through the tor Anon-RPC worker" and names the reads it fetches directly, or the `direct` warning. There is no settings page | Harness verified. Extension not run |
| Anon-RPC: passthrough specifier absent | `SPECIFIERS` in `anonHelios.ts` holds `tor` and `nym` only. `rg -i passthrough dapp/packages/nextjs/utils/harness dapp/packages/extension/src` finds one comment and no address | Verified in source |
| Anon-RPC: the proof covers only the pinned writers | `sync` in `packages/reader/src/sync.ts` proves the union of list writers. Test "is one request covering only the pinned writers" in `packages/reader/test/sync.test.ts` | Tested |
| Anon-RPC: the Snap makes no claim | Panel footer in `packages/snap/src/ui.tsx`. The beat 1 test in `packages/snap/test/bundle.test.ts` asserts "unverified" and "the RPC is not anonymised" | Tested on the built bundle |
| CROPS: README matches the code | README, "CROPS" | This ticket |
| CROPS: no team-run backend in any host | No host has a server of ours. The only team-run service is the static `site/` host, and the reader verifies what it serves | Verified in source |
| CROPS: override is local | Extension: `src/report.ts` and `src/overlay.ts`, override after 5 s, covered by `test/report.test.ts`. Snap: MetaMask's own confirm button. Demo: ticket 13 step 6 | Tested. Browser run pending |
| CROPS: lists pinned by maintainer signature | `acceptList` in `packages/reader/src/lists/index.ts` with `test/lists.test.ts`. The maintainer-change dialog tests in `packages/snap/test/bundle.test.ts`. Demo: ticket 12 step 7 | Tested. Browser run pending |
| CROPS: walkaway test | The `walkaway` test in `packages/snap/test/bundle.test.ts`. Live: step 10 above | Offline test passes. Live run pending |
| ENS: name is a subregistry, writers are subnames, record in a permissioned resolver, EAC grants the publish role | `packages/infra/src/ens-setup.ts`, step 4 above. Rehearsed on an anvil fork of Sepolia in ticket 08, where the manual writer's key was refused with `EACUnauthorizedAccountRoles` | Fork rehearsal only. Live transaction hashes pending |
| ENS: record read through Helios `eth_call` with CCIP-read off | `resolveListRecord` in `packages/reader/src/ens.ts` calls `resolveWithGateways` with no gateways. The extension sends that call through Helios. The Snap sends it to its RPC, and its tests assert the gateway list is empty | Tested. Kohaku is a diagram, so the extension carries this check |
| ENS: did the plain text record fallback trigger | No. That is the spec's step-4 fallback, which ticket 14 calls step 8. ENSv2, the permissioned resolver, and Enhanced Access Control are live on Sepolia, with addresses in ticket 08's Comments. The prize stays claimable once step 4 runs live | Settled |
