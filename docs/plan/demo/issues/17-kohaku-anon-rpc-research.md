# 17: Can Kohaku use Anon-RPC (Tor or Nym) today

**Question:** Can Anon-RPC be used with Kohaku today, and if so, how is it set up? Reads ticket 02 (which said no) and the user's belief that "you can use anon rpc on tor with kohaku".

**Status:** ready-for-human

Everything below was read from source on 2026-11-06. Nothing was built or run, and no setup step below has been tried.

### 2026-11-06, later: done in our patch

The research verdict below was right about upstream and wrong as a conclusion. Nothing stops our Kohaku patch from embedding the harness the way `dapp/packages/extension` does, and that is now done. Tocsin's reads in Kohaku go through the tor-js Anon-RPC worker from an offscreen document, with the worker hash verified through a mainnet Helios. Ticket 16's "Anon-RPC" section has the build and the test. The "What it would take" list at the end was the SDK route and is superseded: we did not bump `@kohaku-eth/provider` or touch Kohaku's own reads, only Tocsin's.

## Verdict

Partly. The answer depends on which Kohaku you mean.

- **The Kohaku SDK: yes.** `@kohaku-eth/provider` has shipped an `anon` backend since `0.1.0-alpha.11` (npm, 2026-09-28). It wraps `@anon-rpc/browser-harness` as a Kohaku `EthereumProvider`, and the SDK repo has a runnable "anon-rpc × Kohaku" proof of concept over the tor-js worker. It is browser-only, marked a proof of concept, and its Tor path uses one demo gateway. This is probably what the user remembers, and on this point they are right.
- **The Kohaku wallet (the extension): no.** None of the 28 branches of `kohaku-extension`, the 10 branches of `kohaku-commons`, or the 5 branches of the `defi-wonderland` commons fork contains any Anon-RPC, Tor, Nym or SOCKS code. The wallet pins `@kohaku-eth/provider` at `0.1.0-alpha.5`, which predates `anon`, and its plugins use the plain viem adapter. The PR that added `anon` to the SDK lists "embedding in kohaku-extension" as out of scope. Ticket 02's finding stands for the wallet.
- **A custom RPC URL in Settings, Networks: not with Anon-RPC.** Anon-RPC gives you a `fetch` function inside a browser sandbox. It has no local HTTP endpoint, and nothing in the repo is one, so Kohaku has no URL to point at.
- **System-level Tor under the wallet: probably works, but it is not Anon-RPC.** Running Chrome through a local Tor SOCKS proxy would send all of the extension's HTTP traffic over Tor, including the relayer and the Colibri prover. That is plain Tor at the browser level. There is no hash-pinned worker and no specifier contract, and Kohaku does not know it is happening. I have not tested it.

## Setup steps for the routes that work

### Route A: Kohaku SDK plus Anon-RPC over Tor (the real "Kohaku with Anon-RPC")

This runs the SDK's own proof of concept against mainnet. It is a web page, not the wallet.

```sh
git clone https://github.com/ethereum/kohaku && cd kohaku
pnpm install
pnpm -r build                                  # root "build" script, package.json:7
cd examples/anon-rpc-poc
npx playwright install chromium
node run.mjs tor                               # or no argument for the passthrough worker
```

`run.mjs` bundles `src/main.ts`, serves it on `127.0.0.1`, opens headless Chromium with WebRTC flags for KPS, and passes if `eth_chainId` is 1 and the block is above 23,000,000 (`examples/anon-rpc-poc/run.mjs:36-62`). PR #271 measured about 20 s to boot and about 1.9 s per `eth_blockNumber` over tor-js.

One catch. The PoC hardcodes the tor-js gateway `170.64.236.147:12298:...` (`examples/anon-rpc-poc/src/main.ts:14`), but Anon-RPC's adopters file now lists `152.236.3.22:12298:...` as the example and calls it a "Demonstration gateway only ... it may disappear at any time" (`adopters.json5:30-33`). If boot hangs, swap in the adopters value.

To use it in your own page, use the docs snippet (`docs/pages/provider.mdx:126-134` in `ethereum/kohaku`):

```ts
import { anon } from '@kohaku-eth/provider/anon'
const provider = await anon({ specifier, rpcUrl, workerConfig, bootstrap })
```

`bootstrap` is a normal provider used for the specifier reads and "is not anonymized" (`provider.mdx:136`; `packages/provider/src/anon/index.ts:20`). The tor-js and Nym specifiers live on mainnet, so `bootstrap` must be a mainnet RPC even if `rpcUrl` is Sepolia. Nox is the one worker whose specifier is on Sepolia (`adopters.json5:44-54`).

### Route B: Kohaku extension under system Tor (not Anon-RPC)

Untested. Based on Chromium's SOCKS doc and Kohaku's manifest.

1. Run a Tor daemon locally (for example `brew install tor && tor`), listening on SOCKS port 9050.
2. Start Chromium with a fresh profile and the proxy flags from Chromium's doc (https://www.chromium.org/developers/design-documents/network-stack/socks-proxy/): `--proxy-server="socks5://127.0.0.1:9050" --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"`. The doc says the first flag sends "all http:// and https:// URL requests" through the proxy, and the second stops local DNS.
3. Load `build/webkit-dev` unpacked from `chrome://extensions`, as in ticket 02.
4. Expect failures where endpoints block Tor exits. `SEPOLIA_RPC_URL` is fixed at build time (`testnetNetworks.ts:4,24-25`), so pick one that accepts Tor before you build.

Whether the MV3 service worker's `fetch` follows `--proxy-server` was not checked in a trace. Re-run ticket 02's CDP trace under the flag before you claim it in the demo. Tor Browser is a Firefox build, and Kohaku has a Gecko target (`package.json:13,34`), but I found nothing from either team on running Kohaku inside Tor Browser.

## Evidence

### 1. Kohaku extension and kohaku-commons, every branch

I ran a per-branch grep on each remote branch head on 2026-11-06, with a 60 s timeout per ref. No ref hit the timeout. The pattern was `anon-rpc|anonrpc|socks|\.onion|tor|nym|mixnet` (case-insensitive, with word boundaries on `tor` and `nym`), and it excluded lockfiles and `node_modules`.

- `ethereum/kohaku-extension`: 28 remote branches, including every `dev-wonderland*` branch. `origin/main` is at `72922ab` (2026-07-03). The only hits are `e2e-playwright-tests/package-lock.json` and `src/legends/public/favicon.svg`, and both are noise.
- `ethereum/kohaku-commons`: 10 branches after `git fetch`, including `fix/remove-hardcoded-rpcs`. `origin/main` is at `29227cc` (2026-07-03). The only hit is `src/consts/humanizer/humanizerInfo.json:19214`, `"name": "SOCKS token contract"`, which is noise.
- `defi-wonderland/kohaku-commons` (the submodule target of `dev-wonderland-m12`): 5 branches, with the same `SOCKS token` hit.
- An earlier wider grep for `ohttp`, `oblivious http`, `privacy transport`, `private rpc` and `anonymi[sz]` also found nothing in any of the three.
- GitHub issue and PR search for `anon-rpc`, `tor`, `nym` and `private rpc` in both repos returned nothing.

How the wallet reads the chain: the plugin hosts build `createPublicClient({ transport: http(network.selectedRpcUrl) })` and wrap it with `viem` from `@kohaku-eth/provider/viem` (`kohaku-commons src/controllers/railgun/hostFactory.ts:2,54-56`, and the same in `controllers/privacyPools/hostFactory.ts:3`). Non-RPC traffic uses `globalThis.fetch` (`railgun/hostFactory.ts:47`). The extension pins `"@kohaku-eth/provider": "0.1.0-alpha.5"` (`package.json:86` on `origin/main`, the same on every branch that has the dependency) and the submodule pins the same version (`kohaku-commons package.json:20`). The manifest has no `offscreen` permission and no `sandbox` pages (`src/web/public/manifest.json:7`), and an MV3 Anon-RPC host needs both (see section 3).

### 2. Kohaku SDK (`ethereum/kohaku`)

- PR #271, "feat(provider): add anon-rpc backend (PoC)", by Meyanis95, merged 2026-09-26 as `4c5e47b`. It is on `master` and every other branch. From its body: "Fills the 'Network Privacy' gap ... swap networks (Tor today, mixnets later) via a config value". Under "Out of scope / known limits": "Browser-only (the harness needs a DOM); embedding in kohaku-extension (MV3 → offscreen document bridge) to be tracked separately." I found no such tracking issue in `kohaku`, `kohaku-extension` or `anon-rpc`.
- Code: `packages/provider/src/anon/index.ts:39-46` constructs `AnonRpcWorker({ address: specifier, config: workerConfig, preExisting: { rpcProvider: bootstrap } })` and boots it with a 120 s timeout. `:50-73` sends each JSON-RPC call as `worker.fetch(config.rpcUrl, { method: 'POST', ... })`.
- Packaging: the `"./anon"` subpath export is in `packages/provider/package.json:46-50`, with the dependency `"@anon-rpc/browser-harness": "^0.3.0"` at `:122`. `CHANGELOG.md:34-36` records it under `0.1.0-alpha.11`: "Browser-only proof of concept." `npm view @kohaku-eth/provider` shows `latest` at `0.1.0-alpha.14` (2026-10-28) and `./anon` in its exports.
- Version skew: `^0.3.0` on a 0.x package excludes 0.4.0, and the lockfile resolves `@anon-rpc/browser-harness@0.3.0` (`pnpm-lock.yaml:505`). We pin 0.4.0, which implements spec 0.4.0 and made `config` a plain value (a breaking change, harness `CHANGELOG.md`, 0.4.0 entry). One app can't share a single harness instance between the two without a dedupe override.
- Docs: `docs/pages/provider.mdx:124-142`, "Anonymous RPC in the browser". `docs/pages/host.mdx:16` says the `provider` and `network.fetch` split "is how a wallet can put Tor, a proxy, or a custom DNS path on relayer traffic".
- Other Tor work around Kohaku. `kohaku-cli` (github.com/kassandraoftroy/kohaku-cli, linked from `docs/pages/examples.mdx:3`) uses `tor-js` 0.4.0 directly (`package.json:37`), not Anon-RPC, and only for non-RPC HTTP: "Ethereum RPC stays clearnet" (`README.md:160`). Third-party PR #25, "feat: add webtor module for Tor integration", was closed unmerged on 2025-12-07. The `wonderland/feat/tech-design` branch has a "Private RPC" section (`docs/pages/practices.mdx:29`) that covers user-chosen RPCs and Helios, not Tor.
- Roadmap: the EF Kohaku roadmap (https://notes.ethereum.org/@niard/KohakuRoadmap) lists, under "In a first phase", "Preventing unecessary IP leakage" and "hiding traffic", plus oblivious `eth_call` reads (TEE+ORAM) and optional P2P transaction broadcast. It names no transport and gives no dates. That makes it planned work, not shipped work. I found no ethresear.ch or blog.ethereum.org post by the Kohaku team on Tor or Anon-RPC.

### 3. Anon-RPC (`ethereum/anon-rpc`, `main` at `c8980fb`, 2026-10-24)

The SDK's links go to `privacy-ethereum/anon-rpc`, which now redirects to `ethereum/anon-rpc` (per `gh repo view`), and that is the repo the npm package names.

- Adopters: `adopters.json5:11-55` lists four workers. They are passthrough ("no anonymization"), tor-js (`0x700dA319...`, mainnet), Nym (`0x3aCD9742...`, mainnet, an 18 MB bundle) and Nox (`0x35133267...`, Sepolia). `walletsAndApps` (`:59-84`) lists only Privacy Pools ("Connect with Tor in the RPC settings") and Kiwi News. Kohaku isn't listed, and the word "kohaku" appears on no branch of the repo.
- No RPC URL to point a wallet at. `docs/integrate-wallet.md:3-4` says it works "by constructing an anonymous `fetch` function". `:24-26` says it is "Browser-only", and `:77-79` says to pass `worker.fetch` "to anything that accepts a custom `fetch` or transport". The `impl/` packages are `browser-harness`, `browser-extension-harness`, `node-harness`, `harness-core`, workers, a specifier tool, a site and `demo-extension`. A grep for `createServer` and `.listen(` finds only the site's Vite bench. The `node-harness` is a library that is "Not yet a conforming harness" (`impl/node-harness/README.md:9-10`), and its default fetch policy refuses loopback (`:215`). Nothing exposes an EIP-1193 provider or a local HTTP proxy.
- What an extension like Kohaku would use: `@anon-rpc/browser-extension-harness` 0.4.0 on npm. It hosts the harness in an MV3 offscreen document and needs the `offscreen` permission and `"sandbox": { "pages": [...] }` in the manifest (`impl/browser-extension-harness/README.md:1-19`, Manifest section). `impl/demo-extension/README.md` is a worked example that holds `AnonRpcWorker` in the background service worker. Our harness README says the same: "For MV3 browser extensions this is not optional" (`dapp/packages/nextjs/node_modules/@anon-rpc/browser-harness/README.md:128-131`).

### 4. Would Kohaku's custom-RPC setting route through a local proxy

Only the main chain reads would, and only in `rpc` mode.

- The URL form rejects anything without an `http` prefix and anything that fails `isValidURL` (`NetworkForm.tsx:347-358`; `validate.ts:185-190`). It then calls `eth_chainId` and requires a match (`NetworkForm.tsx:369-390`). An `http://127.0.0.1:<port>` URL passes the regex. The manifest grants `"http://*/*"` (`manifest.json:21`), and the CSP sets no `connect-src` (`webpack.config.js:93`), so the background could reach it.
- `getRpcProvider.ts:41-75`: in `rpc` mode it is a plain `JsonRpcProvider(rpcUrl)`. In `helios` mode, Helios also talks to `consensusRpcUrl` (`http://unstable.sepolia.beacon-api.nimbus.team/`, `testnetNetworks.ts:26`). In `colibri` mode, the default (`README.MD:55`), Colibri also calls the prover `https://sepolia.colibri-proof.tech/` (`ColibriRpcProvider.ts:59-62`; `testnetNetworks.ts:27`), which ticket 02 saw receive the account address in clear. A proxy URL covers none of those, and it doesn't cover `relayer.ambire.com`, `cena.ambire.com`, `rail-squid.squids.live` or Pimlico (ticket 02 trace).
- So even a working local Tor proxy would hide only part of the traffic. And Anon-RPC doesn't provide one.

### 5. Where our docs' claim came from

`docs/wallet-integrations.md:18` says Kohaku "already routes reads through privacy transports", and `HANDOFF.md:47` says "Ambire fork with Helios built in". `git log -S` traces the wording to `252b08c` (Eason Chai, 2026-11-06, "Feature request: Kohaku module, MetaMask Snap, provider-proxy extension on one shared reader"). That commit cites no source. No primary source supports the claim for the wallet. The closest real things are the roadmap's planned "hiding traffic" item and the SDK's `anon` PoC, which arrived two months after the wallet's last `main` commit. `spec.md:255` already marks the claim "Not verified".

## What it would take to get Anon-RPC into the Kohaku wallet

These are code changes to Ambire files, so user story 43 and HANDOFF's "Ambire untouched" rule are broken again.

1. Bump `@kohaku-eth/provider` from `0.1.0-alpha.5` to `0.1.0-alpha.11` or later in both `package.json` files (extension `:86`, commons `:20`), and check that nothing else in the alpha range broke.
2. Add `@anon-rpc/browser-extension-harness`, add `offscreen` and the `sandbox.pages` entry to `manifest.json`, and copy its static assets in the webpack build, as its README says.
3. Plugin reads only: in both `hostFactory.ts` files, replace `viemProvider(publicClient)` with `anon({ specifier, rpcUrl: network.selectedRpcUrl, bootstrap })`. A mainnet bootstrap RPC is needed for tor-js or Nym, or use Nox on Sepolia.
4. Wallet reads: add a fourth `rpcProvider` kind to `getRpcProvider.ts` that sends ethers' requests through `worker.fetch`, plus the selector in `NetworkForm.tsx`. Without this step only the Railgun and Privacy Pools plugins go anonymous, and the balance and nonce reads seen in ticket 02 stay in clear.
5. Route `network.fetch` (relayer, indexer) through `worker.fetch` too, or accept that those leak.
6. Resolve the harness skew: the SDK wants `^0.3.0`, and our reader uses 0.4.0.

I have not estimated the effort beyond this file list. Steps 1 to 3 match what PR #271 itself deferred.
