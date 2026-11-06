# Kohaku with Tocsin

Tocsin built into Kohaku, the EF privacy wallet extension. The send screen and both sign screens check addresses against the log, and Settings gets a Tocsin page. This folder holds no Kohaku source. It holds two patches and a script that applies them to a fresh clone of upstream, so the repo stays small and the diff stays readable.

| File | What it is |
| --- | --- |
| `pins.sh` | The upstream commits the patches apply to: `ethereum/kohaku-extension` at `72922ab` and its `kohaku-commons` submodule at `29227cc` |
| `patches/kohaku-extension.patch` | UI side: verdict panel, Tocsin settings route, background actions, start-up and 5-minute sync |
| `patches/kohaku-commons.patch` | Controller side: `TocsinController`, the block in transfer, sign-account-op and sign-message, and the jest suites |
| `setup.sh` | Clones, applies both patches, copies `../reader/src` and the Helios plus Anon-RPC helper in, installs, writes `.env` |
| `update-patches.sh` | Writes `patches/` back out from a clone you edited |

The reader is not in the patches. `setup.sh` copies `dapp/packages/reader/src` into `src/ambire-common/src/libs/tocsin/reader/` every time, so Kohaku runs the same reader as the Snap and the extension. The same goes for `dapp/packages/nextjs/utils/harness` (Helios bootstrap, Anon-RPC worker boot, pinned checkpoints), copied into `src/web/extension-services/tocsin-offscreen/harness/`.

## Set up

Needs Node 22.12 or later 22.x (Kohaku's `engines` rejects 23), git, openssl, and network access to GitHub and npm. No GitHub SSH key is needed.

```sh
nvm use 22.12.0
dapp/packages/kohaku/setup.sh            # clones into dapp/packages/kohaku/kohaku-extension (gitignored)
dapp/packages/kohaku/setup.sh ~/kohaku   # or anywhere else
```

It takes about four minutes on a fast connection. If the install fails, run it again: once both patches have applied it reuses the clone and carries on from the install. To start over, delete the clone.

`.env` gets public demo values: publicnode for Kohaku's own Sepolia reads, a dummy Pimlico key, a fresh extension ID key in `key.pem` (not a wallet key), and the Tocsin settings below. Set any of them in the shell before running `setup.sh` to override.

| Setting | Default | Meaning |
| --- | --- | --- |
| `TOCSIN_RPC_URL` | `https://0xrpc.io/sep` | The one RPC for the header, proofs, ENS and flags. Changeable later in Settings, Tocsin |
| `TOCSIN_LIST_NAME` | `tocsin.eth` | Comma-separated lists, followed and pinned on first sync |
| `TOCSIN_LIST_RECORD` | contents of `dapp/list-record.hex` | Replaces the ENS lookup of the first list. Set it empty to read ENS |
| `TOCSIN_LOG_FROM_BLOCK` | `12074077` | The log's deploy block, where the first scan starts |
| `TOCSIN_TRANSPORT` | `tor` | How Tocsin's reads leave the browser: `tor`, `nym` or `direct`. Localhost RPCs always go direct |
| `TOCSIN_TOR_GATEWAYS` | the local `tor-js-gateway` | Comma-separated `host:port:peerId` for the tor transport. Yours is printed when the gateway starts |
| `TOCSIN_MAINNET_CONSENSUS_RPC` | publicnode beacon API | Mainnet Helios, which verifies the Anon-RPC worker hash against the on-chain specifier |
| `TOCSIN_MAINNET_EXECUTION_RPC` | `https://0xrpc.io/eth` | Same light client's execution RPC |

The build bakes these in. Edit `.env` and rebuild to change them.

## Anon-RPC

Every Tocsin read (header, proofs, ENS, log leaves, the list document) goes out through the Anon-RPC worker, so the RPC never learns which device asked. Kohaku's own reads are untouched. The wiring mirrors `dapp/packages/extension`: the service worker opens an offscreen page (`src/web/extension-services/tocsin-offscreen/`) that starts a mainnet Helios, boots the `@anon-rpc/browser-harness` worker with the specifier's hash verified through it, and answers the controller's fetches. The harness's isolation frame is `anon-boot.html`, a manifest sandbox page, because the extension CSP blocks its default inline frame. The Helios plus harness helper is copied from `dapp/packages/nextjs/utils/harness` like the reader.

A localhost RPC URL (the lying proxy, the list server) goes direct, since there is nothing to hide from your own machine and a Tor exit cannot reach it. Build with `TOCSIN_TRANSPORT=direct` to turn the worker off.

The tor transport needs a gateway. Start the local one before loading the extension and wait for "TorClient bootstrapped":

```sh
tor-js-gateway
```

## Run

```sh
cd dapp/packages/kohaku/kohaku-extension
YARN_IGNORE_PATH=1 npx yarn@1.22.22 web:webkit    # watching dev build into build/webkit-dev, about a minute
```

Use `npx yarn@1.22.22`, not a global yarn 4, which would rewrite Kohaku's lockfile. `YARN_IGNORE_PATH=1` stops yarn 1 from handing off to the dapp's yarn 4, which `dapp/.yarnrc.yml` names for everything below `dapp/`. In Chrome, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick `build/webkit-dev`. Onboard with a fresh account. A view-only import of any funded Sepolia address is enough to reach the send form.

The dev build carries Expo's live-reload client, which reloads every page that has Kohaku's content script each time the watcher rebuilds, your demo dApp included. For the demo, stop the watcher and use the production build, which has no reload client:

```sh
YARN_IGNORE_PATH=1 npx yarn@1.22.22 build:web:webkit    # one-off build into build/webkit-prod, a few minutes
```

Load `build/webkit-prod` instead.

Start the static site with CORS from the runbook's "Servers on the demo laptop" (the list document lives there), plus the lying proxy for beat 2.

## The three beats

1. Honest RPC. Send, paste the drainer receiver `0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537`. The panel says Blocked and Send stays disabled.
2. Settings, Tocsin, RPC URL `http://127.0.0.1:8550`, Save and sync. The page shows "chain mismatch at sequence 1", and the send screen shows Unverifiable, never green. Unverifiable does not block Send.
3. Set the RPC URL back to `https://0xrpc.io/sep`, Save and sync, paste again. Blocked.

## Tests

From `kohaku-extension/src/ambire-common`, with the env the tests need:

```sh
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com npx jest Tocsin tocsin decode.test
```

30 tests in 5 suites.

## Changing the code

Edit inside the clone, then run `dapp/packages/kohaku/update-patches.sh [clone dir]` and commit the patches. It diffs against the pinned commits, new files included, and leaves out `yarn.lock`, `package-lock.json`, `key.pem`, `.env` and the reader copy. Change the reader in `dapp/packages/reader`, not in the clone, because `setup.sh` overwrites the copy.

## Not in Kohaku yet

The Snap's Policy section (block threshold, warn-only categories), the token-contract `MALICIOUS_TOKEN` check, and the curator lists `harborwatch.eth` and `lanterndao.eth`. The reader already supports all three; Kohaku's controller and settings page don't pass them yet. Header and proofs come from one RPC, best effort, like the Snap. Kohaku's own Helios and Colibri are not used for Tocsin's proofs yet. Ticket 16 has the details.
