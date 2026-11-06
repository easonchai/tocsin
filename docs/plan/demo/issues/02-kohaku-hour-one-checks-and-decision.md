# 02: Kohaku hour-one checks and hour-three decision

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 1: Kohaku module; Further notes, Kohaku unverified items. `docs/wallet-integrations.md`, Kohaku scope and Order and cut lines.

**What to build:** By hour three the team knows whether Kohaku is the demo wallet. The fork builds, runs on Sepolia, and its transport is identified; or it does not and the Snap becomes the primary host.

**Blocked by:** None (can start immediately)

**Ethskills:** tools, wallets (per AGENTS.md; load before starting)

**Status:** resolved

- [x] The Kohaku extension fork is cloned, builds, and loads in a browser within hour one, with the build command recorded in Comments.
- [x] It runs against Sepolia with a test account; what had to change to get there is recorded.
- [x] Whether its reads go through Anon-RPC, and whether it runs Helios, is recorded with evidence (the module or network trace that shows it).
- [x] Hour-three decision recorded in Comments: Kohaku primary, or Snap primary with Kohaku as a diagram. Tickets 10, 11, and 13 read this decision.
- [x] Ambire itself is unmodified; any change is in the module layer. (Nothing in the fork's source was changed. The finding below is that a module cannot hook the surfaces without editing Ambire files, which is part of why Kohaku is not primary.)

## Comments

### 2026-11-06: hour-one checks and decision

**Decision: Snap primary. Kohaku is shown as a diagram.** Tickets 10, 11 and 13 read this.

The spec's rule is Kohaku primary only if the fork builds, runs on Sepolia, and takes a module on top without touching Ambire. The first two hold. The third does not, and two premises behind choosing Kohaku also turned out false on Sepolia today: Kohaku has no anonymising transport, and its light clients do not currently verify anything.

**Build.** Cloned `ethereum/kohaku-extension` at `72922ab` (2026-07-03) into `../kohaku-extension`, outside this repo. Submodule `src/ambire-common` is `ethereum/kohaku-commons` at `29227cc`. Its `.gitmodules` URL is SSH, so the submodule was fetched with an HTTPS rewrite. Node 22.12.0 (the repo's `.nvmrc`; `engines` rejects Node 23 and up), yarn 1.22.22.

```sh
git -c url."https://github.com/".insteadOf="git@github.com:" submodule update --init
yarn install                                  # 136 s, exit 0
(cd src/ambire-common && npm install)         # 54 s, exit 0
cp .env-sample .env                           # then fill, see below
yarn web:webkit                               # expo dev server; "web compiled successfully" twice in about 54 s
```

Output is `build/webkit-dev` (215 MB, MV3, service worker `background.js`). No build errors, only deprecation warnings. `yarn web:webkit` is a watching dev server; `yarn build:web:webkit` is the one-shot production build (not run).

**What had to change for Sepolia.** No source change. Sepolia is the only network the fork ships (`src/ambire-common/src/consts/testnetNetworks.ts`). `.env` needed three values, because `scripts/validateEnv.js` rejects empty "required" keys and `testnetNetworks.ts` throws without `SEPOLIA_RPC_URL`:

- `SEPOLIA_RPC_URL` set to a public Sepolia RPC (publicnode).
- `BROWSER_EXTENSION_PUBLIC_KEY` from a throwaway `key.pem` made with openssl. This is the extension ID key, not a wallet key.
- `REACT_APP_PIMLICO_API_KEY="dummy"`.

`RPC_PROVIDER` stays at the sample's `colibri`. Alchemy, Hypersync and Pimlico keys were left empty or dummy, so Privacy Pools and the 4337 bundler are not exercised. The Railgun dashboard works without them.

**Loaded and ran.** The chrome-devtools MCP has no tool to load an unpacked extension, and branded Chrome ignores `--load-extension`, so the MCP was not used. The extension was loaded in Playwright 1.52 Chromium 136 with a raw CDP session attached to the service worker for the network trace. Onboarding created a fresh throwaway account in a scratch browser profile (12-word phrase generated in-browser, no funds, nothing written to this repo). After unlock the dashboard renders "Private balance $0.00", a Railgun `0zk` address, "Public balance $0.00".

**Anon-RPC: no.** Source grep over `src/` and the submodule for `anon-rpc`, `specifier`, `tor`, `socks`, `onion`, `nym`, `mixnet` finds nothing transport-related. Kohaku's privacy plugins use plain fetch and a plain viem HTTP client: `src/ambire-common/src/controllers/railgun/hostFactory.ts:47` (`pluginNetwork = { fetch: globalThis.fetch... }`) and `:54` (`http(network.selectedRpcUrl)`), and the same in `controllers/privacyPools/hostFactory.ts:48,55`. The network trace (about 2 minutes after onboarding) shows the service worker calling these hosts directly over HTTPS:

| Host | Requests | What it learns |
| --- | --- | --- |
| ethereum-sepolia-rpc.publicnode.com | 175 | `eth_getCode`, `eth_getTransactionCount` for the account |
| sepolia.colibri-proof.tech | 108 | Colibri prover, gets `eth_getTransactionCount` with the account address in clear |
| ethereum-sepolia-beacon-api.publicnode.com | 108 | beacon blocks for Colibri |
| relayer.ambire.com | 28 | `/v2/identity/<account>/portfolio-additional` |
| rail-squid.squids.live | 24 | Railgun indexer GraphQL |
| cena.ambire.com, api.pimlico.io, api.github.com, raw.githubusercontent.com | 28 | prices, bundler health, phishing lists |

The UI page also called the RPC directly with `eth_getBalance` for the account address. The RPC, the Colibri prover and the Ambire relayer all see which account is checked.

**Helios: present but off, and broken on Sepolia.** The fork has three read modes, picked by `RPC_PROVIDER` or per network in Settings, Networks: `rpc`, `helios`, `colibri` (`src/ambire-common/src/services/provider/getRpcProvider.ts:41-75`). The shipped default is Colibri, not Helios. Sepolia's Helios config is `consensusRpcUrl: 'http://unstable.sepolia.beacon-api.nimbus.team/'` and a hardcoded checkpoint (`testnetNetworks.ts:26,49`). What the checks showed:

- Colibri fails verification on every call in the trace (80 of 80 `eth_getTransactionCount`/`eth_getCode` warnings: `failed to be verfiy: ssz_from_json: body.executionPayload not found`). It then falls back to the unverified RPC. The Sepolia beacon node answers with `"version":"gloas"`, which these parsers do not handle.
- Kohaku pins `@a16z/helios` 0.11.1. In Node against the nimbus endpoint it fails both with the hardcoded checkpoint and with a fresh finalized one: `deserialization error: data did not match any variant of untagged enum HttpRpcMessage`.
- Helios 0.12.0 (our pinned version) with the same nimbus endpoint and a fresh finalized checkpoint synced in 4.3 s and returned a finalized block and state root. publicnode's beacon API has no light-client bootstrap (404) for either version. Kohaku's hardcoded checkpoint is too old to bootstrap.
- `HeliosEthersProvider.ts:192-210`: when Helios is not synced within 12 s, `request()` silently falls back to the plain RPC with no flag to the caller. Colibri does the same by design (`ColibriRpcProvider.ts:42-44`). The UI badge says "Some requests may still fall back to an unverified RPC provider" (`src/web/components/NetworkVerificationBadge/useRpcVerificationBadgeState.ts:48,54`). For the lying-proxy beat a module could not trust Kohaku's provider and would have to run its own Helios.

**Hook points (for tickets 10 and 11).** There is no plugin point for UI or controllers. `@kohaku-eth/plugins` `Host` is only the shape privacy protocols get (keystore, fetch, storage, provider), and Kohaku's own `MainController` builds it. Every surface below is Ambire code. The closest pattern is Ambire's `PhishingController`, which needs edits in five files.

- Background service worker: `src/web/extension-services/background/background.ts` (controller start-up and timers, e.g. `mainCtrl.phishing.updateIfNeeded()` at :1073), `handlers/handleActions.ts` (UI-to-background actions, :823), `types.ts`, and `provider/rpcFlow.ts` (dApp `eth_sendTransaction` and sign requests).
- Controller registry: `src/ambire-common/src/controllers/main/main.ts` (`providers` :287, `phishing` :365, `activity` :382, `transfer` :430). A new controller has to be added here.
- Send screen recipient: `src/web/modules/transfer/screens/TransferScreen/TransferScreen.tsx` (`addressState` :60-118) and `src/ambire-common/src/controllers/transfer/transfer.ts` (`addressState`, `isRecipientAddressUnknown` :93-97). Kohaku's own private send is `src/web/modules/PPv1/transfer/screens/TransferScreen.tsx` with `src/web/modules/railgun/hooks/useRailgunForm.ts`.
- Signing requests: `src/web/modules/sign-account-op/screens/SignAccountOpScreen/SignAccountOpScreen.tsx` with `src/ambire-common/src/controllers/signAccountOp/signAccountOp.ts`. The spender for approvals comes from `src/ambire-common/src/libs/humanizer/modules/Tokens/`. Messages, permits and 7702 authorizations go through `src/web/modules/sign-message/screens/SignMessageScreen/SignMessageScreen.tsx` and `src/ambire-common/src/controllers/signMessage/signMessage.ts` (`authorization-7702` :92, :192).
- Activity list: `src/common/modules/dashboard/components/Activity/ActivityPositions.tsx` and `src/ambire-common/src/controllers/activity/activity.ts`. It stores only the wallet's own submitted account ops and signed messages, with no incoming transfers. The "incoming `tx.from`" surface would have to be built from scratch.
- Settings page: `src/web/modules/settings/screens/` with routes in `src/web/modules/router/components/MainRoutes/MainRoutes.tsx` (:136-160). The provider switch lives in `NetworksSettingsScreen/NetworkForm/NetworkForm.tsx` (:900-930).
- Extension storage: `src/web/extension-services/background/webapi/storage.ts` (`browser.storage.local`, richJson), wrapped by `src/ambire-common/src/controllers/storage/`. UI state reaches screens through a `src/web/contexts/<name>ControllerStateContext` plus `controllersStateLoadedContext.tsx`.

**Effort, realistically.** A Kohaku module needs: a new controller and its wiring in about five Ambire files; edits to three screens plus a settings route; an incoming-activity source that does not exist; a Helios bump to 0.12.0 in both `package.json` files plus a fresh checkpoint (Kohaku's own Helios does not sync); and the Anon-RPC worker wired in from nothing, since Kohaku has no transport to reuse. That is several days in a 215 MB Expo/webpack build with a 1-minute rebuild, and it breaks the "Ambire untouched" rule. The Snap has an official hook and no fork to carry. Kohaku goes in the pitch as a diagram of where the reader would sit.

**Conflicts to note.** `docs/wallet-integrations.md` and HANDOFF describe Kohaku as "Ambire with Helios built in" that "already routes reads through privacy transports". On the fork as of `72922ab` neither holds on Sepolia: the default is Colibri, verification fails, and there is no anonymising transport. The spec's harness note ("if Kohaku's own transport is not Anon-RPC, the harness bootstrap is wired into the module") would apply in full.

**For ticket 13 and the harness.** Helios 0.12.0 + `http://unstable.sepolia.beacon-api.nimbus.team` + a fresh finalized checkpoint is a working Sepolia combination today. publicnode's beacon API is not, because it serves no light-client bootstrap. The nimbus endpoint is plain HTTP and labelled unstable, so treat it as a dependency.
