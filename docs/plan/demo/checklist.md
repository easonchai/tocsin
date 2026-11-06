# Demo test checklist

The human-only steps left in the `ready-for-human` tickets, in the order they depend on each other. Commands and context are in `runbook.md`. Commands run from `dapp/` unless a step says otherwise. Record every tx hash and result in the Comments of the ticket named in each heading.

## Resume here

State at 2026-11-06. Steps 0 to 2 and 7 are done. Step 6 was rehearsed against a provisional list. `tocsin.eth` is registered (ticket 08).

1. Pick the static host for `site/` (step 0). That unblocks steps 3 and 4.
2. Step 3: fill and sign the real list, commit `site/lists/default.json` and `site/mirror/`, deploy `site/`, set `LIST_RECORD`. Regenerate `site/mirror/` first; the copy from 2026-11-06 stops at block 12074317.
3. Step 4: `ens-setup` and `ens-publish`.
4. Step 6 again with the real list, pasted into ticket 07.
5. Step 5 needs the MetaMask demo account's key for the first `cast send`.
6. Steps 8 to 11. For Tor in step 9, start `tor-js-gateway` first (runbook step 9).

Before any browser step: `yarn start` from `dapp/`, plus `tor-js-gateway` in its own terminal if using Tor.

## 0. Setup

- [x] `yarn install` in `dapp/`.
- [x] Fresh keys for manual writer, relayer, detector, ENS owner, maintainer, written straight into `packages/infra/.env` and `packages/reader/.env` (mode 600). Never reuse an anvil key: they carry EIP-7702 delegations on Sepolia.

  | Role | Address | Fund |
  | --- | --- | --- |
  | Manual writer | `0x1D3B86A924ffb140bdD74Ee6a7533921ed141583` | yes |
  | Relayer | `0x7Bae2bbcEC2c9424aCCBB6a7EB43301D8Cc92C98` | yes |
  | Detector | `0xe3a9678eD0992416C5230f52E3B1fF9775CCA999` | never |
  | ENS owner, also the deployer | `0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31` | yes |
  | Maintainer | `0x606EE24A4E6E3919FF90B1fD3d2649710Fd99DE1` | yes |

- [x] Deployer keystore. The deployer is the ENS owner key, imported as the keystore `packages/foundry/.env` names in `DEPLOYER_KEYSTORE_ACCOUNT`. From the repo root, in your own terminal (it prompts for a password):

  ```sh
  cast wallet import tocsin-deployer --private-key "$(sed -n 's/^ENS_OWNER_PRIVATE_KEY=//p' dapp/packages/infra/.env)"
  cast wallet address --account tocsin-deployer   # expect 0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31
  ```
- [x] Demo account `0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca` in MetaMask Flask, funded 0.05 from the deployer (`0x47c978172d7d1e3eb53c0aba588731e15f7f0bd3cabbe5c82ba7f310d726760f`).
- [x] Funded: ENS owner and deployer 0.5 from the faucet, then 0.05 each from it to the manual writer (`0xcc567e58def9a057878dde310f0c19c522060a26c583a223290f4a4669a1fdaf`), relayer (`0x967c49145f3b0c7359c0ff2fa1c76f4f851c80f4dc2a1167141788ef8515e62a`), maintainer (`0xc93eaf73caa6366ce8e22a4ae9da8dc64f092918f45e727e44bf083a06e2b0a0`).
- [x] Env files: `infra/.env` and `reader/.env` created from `.env.example`. `RPC_URL` and `SEPOLIA_RPC_URL` set to keyless publicnode, plus `CHAIN_ID`, `LOG_ADDRESS` (the predicted address), `ENS_WRITERS`, `ENS_MAINTAINER`, `TOCSIN_*` writer and maintainer addresses, `DETECTOR_PREFIX_HEX=3`, `DETECTOR_SUFFIX_HEX=3`. Still empty: `LOG_FROM_BLOCK`, `LIST_RECORD`, `ENS_NAME`, `TOCSIN_SITE_BASE_URL`, `TOCSIN_OPERATOR_NAME`.
- [x] Pick the team's ENS name: `tocsin.eth`, unregistered on Sepolia as of 2026-11-06. `ENS_NAME` set in `infra/.env`.
- [ ] Pick the static host for `site/`. It must send `access-control-allow-origin: *`.

## 1. Deploy the log (log-contract 06)

- [x] From the repo root: `bash dapp/packages/foundry/scripts-sh/deploy-sepolia.sh`, type `DEPLOY`.
- [x] Deployed address equals the predicted `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`.
- [x] Sourcify and Etherscan both show the source.
- [x] Put the address in `LOG_ADDRESS`. Put the receipt's `blockNumber` from `packages/foundry/broadcast/Deploy.s.sol/11155111/run-latest.json` in `LOG_FROM_BLOCK`.
- [x] Smoke test: `forge script script/Smoke.s.sol --rpc-url sepolia --account tocsin-deployer --broadcast` from `packages/foundry`. Writer sequence 1, global sequence 1.

  Deploy tx `0x10e8e5dab0c7571012fbdabddd9200bcedfb8fb68426452f1c5a55709e1061b8`, block 12074077 (now `LOG_FROM_BLOCK`). Smoke tx `0xeeced1917c1148e884ab95c8c6e41380c6e915df9ba125b1c77e95c2f28a8f2b`. The script's own smoke and Etherscan steps failed on public RPC lag and were rerun by hand.

## 2. Seed (demo 06)

```sh
yarn workspace @tocsin/infra test
yarn workspace @tocsin/infra seed
```

- [x] Check the printed chain, log, balances, and gas price, then type `SEED`. If it stops partway, read the printed hashes before rerunning: a rerun resends the first manual batch.
- [x] 3 transactions, 50 leaves. Hashes recorded, `Appended` events visible on Etherscan.
- [x] Writer sequences after seeding match the leaf counts the script sent. Manual 25, detector 25, global 51 (50 plus the smoke leaf). Hashes in ticket 06.

## 3. Trust list and mirror (demo 04)

Fill the `TOCSIN_*` names in `packages/reader/.env`, then:

```sh
yarn workspace @tocsin/reader publish-list fill "$PWD/../site/lists/default.template.json" "$PWD/../site/lists/default.json"
yarn workspace @tocsin/infra mirror
yarn workspace @tocsin/reader publish-list sign "$PWD/../site/lists/default.json" "<TOCSIN_SITE_BASE_URL>/lists/default.json" > list-record.hex
```

- [ ] `site/lists/default.json` and `site/mirror/*.json` committed, `site/` deployed.
- [ ] Both `snapshotURI` URLs in the list answer, with `access-control-allow-origin: *`.
- [ ] Contents of `list-record.hex` put in `LIST_RECORD`.

## 4. ENS name and list record (demo 08)

- [x] Register the name at sepolia.app.ens.domains. If the app won't take payment, ticket 08's Comments give the `cast` path. Done 2026-11-06 with ensjs from the owner key, register tx `0x9e8c300d5907a7b7312f95fbf103e4daaabe9a9812b3a9b953ea87dd74340e06`. Hashes in ticket 08.
- [ ] Set `ENS_NAME`, `ENS_OWNER_PRIVATE_KEY`, `ENS_WRITERS=manual=<addr>,detector=<addr>`, `ENS_MAINTAINER`, `MAINTAINER_PRIVATE_KEY` in `packages/infra/.env`.

```sh
yarn workspace @tocsin/infra ens-setup
yarn workspace @tocsin/infra ens-publish list - < list-record.hex
```

- [ ] Every printed hash recorded in ticket 08.

## 5. Detector (demo 09)

- [ ] Add `DETECTOR_PREFIX_HEX=3` and `DETECTOR_SUFFIX_HEX=3` to `packages/infra/.env`.
- [ ] In its own terminal: `yarn workspace @tocsin/infra detect`. It prints chain 11155111 and no balance warning.
- [ ] Plant a lookalike. V is the demo account, C the manual writer, hex in lowercase:

  ```sh
  cast send <C> --value 0.001ether --account <V> --rpc-url $RPC_URL
  cast wallet vanity --starts-with <C hex chars 1-3> --ends-with <C last 3 hex chars>
  cast send <L> --value 0.001ether --account <manual writer> --rpc-url $RPC_URL
  cast send <V> --value 1000wei --private-key <L throwaway key> --rpc-url $RPC_URL
  ```

  Ticket 09 uses `--private-key` throughout. The runbook says keystore accounts with `--account`. Keep the L key out of the repo and any chat.
- [ ] Within 5 minutes: `queued <L> (tx) dust <hash>`, then `relayed 1 leaves in <hash>`.
- [ ] Etherscan event log shows one `Appended` with the detector as writer, subject L, category 1, evidence equal to the dust hash. Both hashes recorded.
- [ ] `yarn workspace @tocsin/infra eval <L> --source rpc --context recipient` prints `warn`.

## 6. Three beats at the CLI (demo 07)

- [ ] Terminal A: `yarn workspace @tocsin/infra lying-proxy`.
- [ ] Terminal B, output pasted into ticket 07:

  ```sh
  yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc     # block
  yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source proxy   # unavailable, chain mismatch at sequence 1
  yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source mirror  # block
  yarn workspace @tocsin/infra eval 0xCd2698C9c9b2b69625DD2a56252190647F34913d --source rpc --context recipient  # warn
  ```

  Rehearsed 2026-11-06 with a list signed for a placeholder host (`http://localhost:8000`) and `site/` served locally: rpc `block`, proxy `unavailable, chain mismatch at sequence 1` (manual writer), mirror `block`, lookalike `warn`. Both writers synced to sequence 25. Rerun and paste into ticket 07 once step 3 signs the real list. Public RPC lag (publicnode backends a block apart) failed about half the runs with `block not found` or `beyond current head`; a retry passed each time.

## 7. Harness page (demo 01)

To rerun, follow runbook step 9 ("Local Tor gateway" and the RPC-by-transport table).

- [x] `tor-js-gateway` running in its own terminal (Tor only). Wait for "TorClient bootstrapped".
- [x] `yarn start`, open http://localhost:3000/harness. Set the writers field to both writer addresses.
- [x] Tor with execution RPC `https://0xrpc.io/sep`: proves both writers.
- [x] Nym with execution RPC `https://sepolia.gateway.tenderly.co`: proves both writers.
- [x] Page prints proven values of slots 2 and 3 at the log's address and the header they were proven against.

Results 2026-11-06:

| Transport | Execution RPC | Result |
| --- | --- | --- |
| Tor, public gateway `152.236.3.22` | any | fail. The KPS dial timed out. Outbound UDP works here (STUN answered), and the official tor-js live demo failed the same way, so the gateway is down |
| Tor, local gateway `127.0.0.1:12298:uEiDmYGj…uPQ` | `0xrpc.io/sep` | **pass**. Worker hash `0x5b62f358…ec818b` matched. Finalized block 12074530, both writers at sequence 25, 3 requests via the worker, 21 s |
| Tor, local gateway | Tenderly | fail. 403 to Tor exits |
| Nym | Tenderly | **pass**. Worker hash `0xf13a448a…1fceb8` matched. Finalized block 12074372 (`0x99736e1b…49c060`), both writers at sequence 25, 4 requests via the worker, 93 s |
| Nym | `0xrpc.io/sep` | fail. 415: the Nym worker drops request headers, even after the shim switched to a string body and object headers like anon-rpc's reference demo |
| Nym | publicnode | fail. 4444 "distance to target block exceeds maximum proof window" |

Proven values at both blocks: manual `writerHead` `0xa8839ccc…b4b210a`, detector `writerHead` `0x98b14072…0b21bf2`.

The local gateway was built from `ethereum/tor-js` at d9d9612. Its binary is at `~/.cargo/bin/tor-js-gateway`, and its config and key are in `~/Library/Application Support/tor-js-gateway/`. `nextjs/.env.local` points at `127.0.0.1` with `0xrpc.io/sep`. Step 9 uses the same `installFetchShim`, so the same RPC-by-transport rule applies.

## 8. Snap in MetaMask Flask (demo 12)

Tried 2026-11-06 with the provisional list (record baked in with `TOCSIN_LIST_RECORD`, document served from `localhost:8000`). Installed, and synced at block 12074725 against `0xrpc.io/sep`. publicnode had failed the first sync with "proof request for 2 writers failed". This Flask shows `endowment:page-settings` as "Unknown permission", so the settings page and its leaf source switch are missing. Only the RPC beat can be shown until Flask supports it. The Snap's tests fail on a build with `TOCSIN_*` baked in; run them on a default build.

Use a fresh Chrome profile.

```sh
TOCSIN_RPC_URL=https://0xrpc.io/sep TOCSIN_LIST_NAME=tocsin.eth TOCSIN_LOG_FROM_BLOCK=12074077 yarn workspace @tocsin/snap build
yarn workspace @tocsin/snap test
yarn workspace @tocsin/snap serve
```

- [ ] Install from any page's console: `await ethereum.request({ method: "wallet_requestSnaps", params: { "local:http://localhost:8080": {} } })`. In Menu, Snaps, Tocsin, Settings both writers show "synced to sequence N" in under 30 s. Time recorded.
- [ ] Block before confirm: send to `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`. Tocsin tab shows "Blocked by your pinned list", the writer, "Drainer receiver", an evidence link. MetaMask's critical styling shows before Confirm. Footer says "unverified" and "best-effort".
- [ ] Permit at signing: `eth_signTypedData_v4` with the `Permit` from ticket 12 Comments step 4, spender `0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e`. Block panel appears. Reject.
- [ ] Without the Snap: second fresh profile with Flask and no Snap, same send. MetaMask shows no warning.
- [ ] Three beats from Settings. Leaf source RPC, Save and sync, send: blocked. Run the lying proxy, source Custom URL `http://127.0.0.1:8550`, Save and sync, send: "Tocsin cannot vouch for this" and "chain mismatch at sequence N". Source Mirror, Save and sync, send: blocked.
- [ ] Maintainer change: copy the list, set `maintainer` to a second address, raise `version`, sign with `MAINTAINER_PRIVATE_KEY=<second key> yarn workspace @tocsin/reader publish-list sign <doc> <listURI>`, host it, `yarn workspace @tocsin/infra ens-publish list <record.hex>`. Press Sync now. "List maintainer changed" dialog appears. Decline: old maintainer still pinned, row says "declined", send still blocks.
- [ ] Restore the original list record.

## 9. Extension in Chrome 116 or later (demo 13)

```sh
TOCSIN_LIST_NAME=tocsin.eth TOCSIN_LOG_FROM_BLOCK=12074077 yarn workspace @tocsin/extension build
yarn workspace @tocsin/extension test
```

Add `TOCSIN_TRANSPORT=direct` only if the network blocks Tor and Nym.

- [ ] MetaMask on Sepolia. `chrome://extensions`, Developer mode, Load unpacked, pick `packages/extension/dist`.
- [ ] Inspect `offscreen.html`: Console has no CSP or wasm errors. Network tab never shows the Sepolia execution host as a direct request.
- [ ] From an https page console: `const [from] = await ethereum.request({ method: "eth_requestAccounts" })`, then `await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: "<address>", value: "0x0" }] })` for each check below.
- [ ] Before sync finishes: `unavailable` overlay names its step. Continue opens MetaMask. Stop gives 4001 and MetaMask opens nothing.
- [ ] Block, `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`: overlay shows writer, category, evidence. MetaMask stays closed. Override counts down 5 s. Stop gives 4001. Repeat and override: MetaMask opens.
- [ ] Warn, address L from step 5: overlay appears, Continue opens MetaMask.
- [ ] Clean address: no overlay, MetaMask opens straight away.
- [ ] Permit: `eth_signTypedData_v4` with spender `0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e`. Block overlay.
- [ ] EIP-6963: connect the Next.js app at http://localhost:3000 through RainbowKit, send to the drainer receiver. Same block overlay before MetaMask.
- [ ] Extension turned off: repeat the block send. MetaMask opens with nothing about the flag.
- [ ] Keep MetaMask on Sepolia for the demo. Off Sepolia a Sepolia-only flag looks clean.

## 10. Live walkaway (demo 14)

- [ ] Snap Settings: leaf source RPC, Sync now, the drainer receiver is blocked.
- [ ] Clear the `erc-threat-flag-log.list` text record at sepolia.app.ens.domains and take `site/` offline.
- [ ] Sync now: "Last check" reads `stale`, maintainer unchanged, both writers "synced to sequence N".
- [ ] Send to `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`: "Blocked by your pinned list", writer shown as a short address.
- [ ] Extension: reload, wait for sync, send from a page console. Still blocks.
- [ ] Restore: `yarn workspace @tocsin/infra ens-publish list - < list-record.hex`, redeploy `site/`.
- [ ] "Last check: stale" row and block panel recorded in ticket 14.

## 11. Wrap-up

- [x] Drop the "not yet deployed" sentence from the README CROPS section.
- [ ] Right before the demo, rerun `yarn workspace @tocsin/infra mirror` and redeploy `site/`. Detector leaves make the mirror stale.
