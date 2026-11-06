# Run the demo

Nothing team-side is needed. The log is deployed and seeded on Sepolia, the three trust lists are signed and committed, and their documents are served from this repo's `site/` folder by the script below. One command on a fresh clone gets you a Kohaku wallet and a MetaMask Snap that check addresses against the log.

## Prereqs

| Tool | Why |
| --- | --- |
| git, python3, curl, openssl | clone Kohaku, serve `site/`, health checks, the extension ID key |
| Node 22.12 or a later 22.x | Kohaku's `engines` field rejects anything else. With [mise](https://mise.jdx.dev) on PATH the script switches by itself; with nvm, `nvm install 22.12.0 && nvm use 22.12.0` |
| Chrome | loads the Kohaku build unpacked |
| `tor-js-gateway` | Tocsin's reads leave the wallet over Tor through this local gateway. Needs Rust 1.91+, OpenSSL and SQLite, about 6 minutes once: `git clone --depth 1 https://github.com/ethereum/tor-js && cd tor-js && cargo build --release -p tor-js-gateway && cp target/release/tor-js-gateway ~/.cargo/bin/`. No Rust: `TOCSIN_TRANSPORT=direct ./demo.sh` runs without it, and the wallet says the reads are not anonymised |
| MetaMask Flask, optional | only for the Snap half. Production MetaMask installs allowlisted Snaps only. Use a fresh Chrome profile so it does not fight your MetaMask |

No yarn: the script uses `npx yarn`. No keys: every value is public and lives in the script's defaults.

## Start

```sh
./demo.sh
```

The first run clones Kohaku at the pinned commits, applies the Tocsin patches, installs, builds the production bundle and the Snap. About ten minutes on a fast connection. Later runs skip anything already built and start the servers in a few seconds. If an install fails partway, run it again. To rebuild, delete `dapp/packages/kohaku/kohaku-extension/build` or `dapp/packages/snap/dist`.

It starts, and reuses if already running:

| Server | Where | For |
| --- | --- | --- |
| `tor-js-gateway` | UDP 12298 | the Tor path out of the browser |
| static `site/` with CORS | `127.0.0.1:8000` | the list documents the wallet syncs |
| lying proxy | `127.0.0.1:8550` | beat 2: a Sepolia RPC that drops one flag |
| Snap server | `localhost:8080` | Flask installs the Snap from here |

Logs go to `/tmp/tocsin-demo`. Ctrl-C stops what the script started.

## Kohaku

1. `chrome://extensions`, Developer mode on, Load unpacked, pick `dapp/packages/kohaku/kohaku-extension/build/webkit-prod`.
2. Onboard. Import the demo account `0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca` view-only; it holds Sepolia ETH and both demo tokens.
3. Wait for the first sync, about 30 seconds while the Anon-RPC worker boots over Tor. If it ends with "request to 0xrpc.io failed", open Settings, Tocsin and press Sync now.

The three beats:

1. Honest RPC. Send, paste the drainer receiver `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`. The panel says Blocked and Send stays disabled.
2. Lying RPC. Settings, Tocsin, RPC URL `http://127.0.0.1:8550`, Save and sync. The page shows "chain mismatch at sequence 1". On Send the same address is Unverifiable, never green. The wallet cannot be fed a clean answer, only an unverifiable one.
3. Back. RPC URL `https://0xrpc.io/sep`, Save and sync, paste again. Blocked.

Token check. On the Dashboard, scroll the token list to the bottom, "+ Add custom token", network Sepolia, paste the address, Add Token. Once for each:

| Token | Address | On Send |
| --- | --- | --- |
| fakeUSDC | `0x2Ba2B2F4bd18D04C3bA92DB9F73a49d19c87b4B8` | "Tocsin blocked this token: Malicious token", Send disabled whatever the recipient |
| realUSDC | `0xf53749FD5e85d4169E95E18FeD40b9A5219FC039` | no token panel; the recipient check alone decides |

Both show the symbol USDC, so tell them apart by address.

The deep reference, patches, settings and tests: `dapp/packages/kohaku/README.md`.

## Snap

1. In Flask, create a wallet and switch to Sepolia.
2. On any page's DevTools console:

   ```js
   await ethereum.request({ method: "wallet_requestSnaps", params: { "local:http://localhost:8080": {} } })
   ```

   Approve. Menu, Snaps, Tocsin opens the home page: the followed lists, each writer's synced sequence, and the one RPC URL the Snap uses.
3. Send to `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`. The transaction insight says Blocked.
4. On the home page set the RPC URL to `http://127.0.0.1:8550` and press Sync now. The list card shows "chain mismatch at sequence 1". The same send is Unverifiable.
5. Set it back to `https://0xrpc.io/sep`, Sync now, send again. Blocked.

If Chrome blocks the Snap from reaching `127.0.0.1`, put the lying proxy behind an https tunnel and enter that URL instead.

## Also in the repo

The provider-proxy extension and the `/harness` page, which prove the log's heads through Helios in the browser, are in `docs/plan/demo/runbook.md` under "The extension" and "The harness page". The command-line beats and everything an operator does (deploy, seed, lists, ENS, detector) are in the same file.
