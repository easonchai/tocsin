# Run the demo

Nothing team-side is needed. The log is deployed and seeded on Sepolia, the three trust lists (`core.tocsin.eth`, `blockaid.tocsin.eth`, `scamsniffer.tocsin.eth`) are signed and committed, and their documents are served from this repo's `site/` folder by the script below. One command on a fresh clone gets you a Kohaku wallet and a MetaMask Snap that check addresses against the log.

## Prereqs

| Tool | Why |
| --- | --- |
| git, python3, curl, openssl | clone Kohaku, serve `site/`, health checks, the extension ID key |
| Node 22.12 or a later 22.x | Kohaku's `engines` field rejects anything else. With [mise](https://mise.jdx.dev) on PATH the script switches by itself; with nvm, `nvm install 22.12.0 && nvm use 22.12.0` |
| Chrome | loads the Kohaku build unpacked |
| `tor-js-gateway` | Tocsin's reads leave the wallet over Tor through this local gateway. Needs Rust 1.91+, OpenSSL and SQLite, about 6 minutes once: `git clone --depth 1 https://github.com/ethereum/tor-js && cd tor-js && cargo build --release -p tor-js-gateway && cp target/release/tor-js-gateway ~/.cargo/bin/`. No Rust: `TOCSIN_TRANSPORT=direct ./demo.sh` runs without it, and the wallet says the reads are not anonymised |
| MetaMask Flask, optional | only for the Snap half. Production MetaMask installs allowlisted Snaps only. Use a fresh Chrome profile so it does not fight your MetaMask |

No yarn: the script uses `npx yarn`. No keys: every value is public and lives in the script's defaults.

## For agents

Run `./demo.sh` in the background and watch its log; it is done when it prints "All up". Do not guess a value the script reads from the environment. If you are not sure what the human wants, ask before starting, because the Kohaku and Snap builds bake the values in and a change means a rebuild.

| Env | Default | Ask the human when |
| --- | --- | --- |
| `TOCSIN_TRANSPORT` | `tor` | `tor-js-gateway` is not on PATH. Ask whether to build it (Rust, about 6 minutes) or run `direct`, which the wallet reports as "not anonymised" |
| `TOCSIN_RPC_URL` | `https://0xrpc.io/sep` | the wallet's first sync fails against the default, or the human has a Sepolia RPC of their own |
| `TOCSIN_LIST_NAME` | `core.tocsin.eth,blockaid.tocsin.eth,scamsniffer.tocsin.eth` | the human wants to follow different lists |
| `TOCSIN_LIST_RECORD`, `TOCSIN_LIST_RECORDS` | empty, read from ENS | never set by hand; `./bootstrap.sh` writes them for lists without an ENS record |
| `TOCSIN_LOG_FROM_BLOCK` | `12074077` | never for the committed log; a redeployed log needs its deploy block |
| `TOCSIN_TOR_GATEWAYS` | this machine's gateway certhash | never; the script derives it |
| `LOG_DIR` | `/tmp/tocsin-demo` | the human wants the logs elsewhere |

The script's first argument is the Kohaku clone directory, default `dapp/packages/kohaku/kohaku-extension`. Ask if the human already has a clone they want reused.

Steps only the human can do, in order:

1. Install `tor-js-gateway` or pick `direct`, if the check above fails.
2. Load the Kohaku build unpacked in Chrome, onboard, import the demo account. Hand off with the path `demo.sh` prints and the Kohaku section below.
3. Install MetaMask Flask and the Snap, if they want the Snap half.
4. On the `./bootstrap.sh` path, send 0.12 Sepolia ETH to the address the script prints. `docs/agents/bootstrap.md` has that handoff.

## Start

```sh
./demo.sh
```

The first run clones Kohaku at the pinned commits, applies the Tocsin patches, installs, builds the production bundle and the Snap. About ten minutes on a fast connection. Later runs skip anything already built and start the servers in a few seconds. If an install fails partway, run it again. To rebuild, delete `dapp/packages/kohaku/kohaku-extension/build` or `dapp/packages/snap/dist`.

It starts, and reuses if already running:

| Server | Where | For |
| --- | --- | --- |
| `tor-js-gateway` | UDP 12298 | the Tor path out of the browser |
| static `site/` with CORS | `127.0.0.1:8000` | the two curator list documents the wallet syncs |
| lying proxy | `127.0.0.1:8550` | beat 2: a Sepolia RPC that drops one flag |
| Snap server | `localhost:8080` | Flask installs the Snap from here |

Logs go to `/tmp/tocsin-demo`. Ctrl-C stops what the script started.

## Kohaku

1. `chrome://extensions`, Developer mode on, Load unpacked, pick `dapp/packages/kohaku/kohaku-extension/build/webkit-prod`.
2. Onboard. Import the demo account `0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca` view-only; it holds Sepolia ETH and both demo tokens.
3. Wait for the first sync, about 30 seconds while the Anon-RPC worker boots over Tor. If it ends with "request to 0xrpc.io failed", open Settings, Tocsin and press Sync now.

The three beats:

1. Honest RPC. Send, paste the drainer receiver `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`. The panel says Blocked and Send stays disabled.
2. Lying RPC. Settings, Tocsin, RPC URL `http://127.0.0.1:8550`, Save and sync. The page shows "chain mismatch at sequence 93" for core.tocsin.eth's writer. The wallet cannot be fed a clean answer, only an unverifiable one. With all three lists followed, `0x79fD…7537` itself still reads Blocked, because blockaid.tocsin.eth's flag on it is untouched. Paste drainer-receiver-4 `0xe25d04e7a7B357179eBf53b16f4C5304c6818fb9`, which only core.tocsin.eth flags, to show Unverifiable.
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
4. On the home page set the RPC URL to `http://127.0.0.1:8550` and press Sync now. The list card shows "chain mismatch at sequence 93". With all three lists followed, `0x79fD…7537` itself still reads Blocked, because blockaid.tocsin.eth's flag on it is untouched. Paste drainer-receiver-4 `0xe25d04e7a7B357179eBf53b16f4C5304c6818fb9`, which only core.tocsin.eth flags, to show Unverifiable.
5. Set it back to `https://0xrpc.io/sep`, Sync now, send again. Blocked.

If Chrome blocks the Snap from reaching `127.0.0.1`, put the lying proxy behind an https tunnel and enter that URL instead.

## Also in the repo

The provider-proxy extension and the `/harness` page, which prove the log's heads through Helios in the browser, are in `docs/operator.md` under "The extension" and "The harness page". The command-line beats and everything an operator does (deploy, seed, lists, ENS, detector) are in the same file.
