# 15: Kohaku send-screen block, feasibility in one engineer-day

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 1: Kohaku module (lines 158-167); user stories 40 and 43. `docs/wallet-integrations.md`, Kohaku module. Ticket 02's Comments (hook points, effort). Tickets 10 and 11 (shelved scope).

**What to build:** Nothing yet. This ticket answers whether a tocsin reader inside the Kohaku fork can block or warn on a flagged recipient on the send screen within about one engineer-day, and what the smallest working version is. Everything below was read from the fork at `72922ab` and this repo; nothing was built or run.

**Blocked by:** None. Reads 02 (hour-one checks), 12 (Snap engine, reused), 07 (list and mirror files).

**Ethskills:** tools, wallets, frontend-ux (per AGENTS.md; load before building)

**Status:** ready-for-human

The go or no-go is a human call because it means editing one Ambire file, which the spec (user story 43) and HANDOFF forbid.

## Verdict

Doable with caveats. A hard block of a flagged recipient on Kohaku's own send screen is about 120 new lines plus a roughly 15-line edit to one Ambire file, `src/ambire-common/src/controllers/transfer/transfer.ts`, and no UI change at all, because the transfer controller already owns recipient validation and the screen already renders its message and disables the button on failure. The list reads go over plain `fetch` to the network's selected RPC, the same way Kohaku's own Railgun host does, so the trust level equals the Snap's: unverified header, best-effort. Half a day for the block including the build loop, the rest of the day for the lying-proxy beat if wanted. It does not satisfy ticket 10 or 11, it breaks "Ambire untouched", and it proves nothing the Snap does not already prove. Ticket 02's effort estimate ("several days") was for the full ticket-10 scope and stands; its claim that a module "cannot hook send without editing Ambire files" also stands. What it missed is that the edit is one file, not five, because the PhishingController is the wrong template for the send screen.

## Minimum change list

1. `src/ambire-common/src/libs/tocsin/reader/`, new: the reader package copied unchanged from `dapp/packages/reader/src/` (8 files plus `lists/`, about 40 KB; `dapp/packages/reader/src/index.ts:1-8`). Its only dependency is viem (`dapp/packages/reader/package.json:16-18`), which Kohaku already has at 2.33.3 (`package.json:244`) and the submodule at 2.33.2 (`src/ambire-common/package.json:34`). Zero lines written.
2. `src/ambire-common/src/libs/tocsin/engine.ts`, new, about 100 lines: a port of the Snap engine with the settings, maintainer dialog, snapshot source and ENS reverse names removed. Keep `rpcRequest` (`dapp/packages/snap/src/engine.ts:43-54`), `ethCall` (:56-60), `fetchList` (:88-97), the `acceptList` plus `sync` body of `runSync` (:134-181 minus the loop over names and the leaf-source switch), and `evaluate` as in `assess` (:218-239). One list, record hex hardcoded from `dapp/list-record.hex` so the ENS `eth_call` is optional. Returns `{ verdict, message }` for an address.
3. `src/ambire-common/src/controllers/transfer/transfer.ts`, about 15 lines in three places:
   - a public field `tocsin: { address: string; verdict: string; message: string } | null = null` next to `isRecipientAddressUnknown` (:95). Public fields reach the UI with no other wiring because `toJSON` spreads `...this` (:743-746) and the screen reads the controller state wholesale (`TransferScreen.tsx:56-73`).
   - in `#onRecipientAddressChange` (:440-458), after `checkIsRecipientAddressUnknown()` (:457): start the engine once (memoised promise, kicked off in the constructor after `this.#initialLoadPromise = this.#load()` at :174), evaluate `this.recipientAddress`, set `this.tocsin`, `emitUpdate()`.
   - in `validationFormMsgs` (:283-310), after `validateSendTransferAddress` (:291-301): if `this.tocsin?.verdict === 'block'` and the address matches, return `recipientAddress: { success: false, message }` in a fresh object. Note the getter mutates the module constant `DEFAULT_VALIDATION_FORM_MSGS` (:286); do not add to that.

That is the whole hard block. `isFormValid` already requires `recipientAddress.success` (:323) and the screen already shows the failure text as the input's error (`TransferScreen.tsx:292-294`, via `src/common/hooks/useAddressInput/utils/validation.ts:41-45`) and disables the button on it (`TransferScreen.tsx:324`).

A non-blocking `warn` returns `success: true` with the message, which the input shows as its non-error label (`validation.ts:48-52`, `TransferScreen.tsx:295-297`). That label is styled as success. Fixing the colour means touching `TransferScreen.tsx` and the address input; skip it for a demo, or make `warn` block too.

Build settings: `SEPOLIA_RPC_URL` in Kohaku's `.env` becomes the reader's RPC (see question 3). The runbook's finding that publicnode fails a proof at "latest" about 1 time in 6 (`docs/plan/demo/runbook.md:144`) applies, so set it to `https://0xrpc.io/sep`.

## What it would not do, against tickets 10 and 11

- No background sync on new headers, no extension storage for checkpoints (ticket 10, bullet 2). The sync result lives in the controller's memory and reruns from `TOCSIN_LOG_FROM_BLOCK` whenever the service worker restarts.
- No settings page, no pinned-lists-by-ENS display, no leaf source switch (ticket 10, bullet 4). The lying-proxy beat is possible only by pointing the leaf RPC at the proxy via a build-time constant and rebuilding.
- No verdict panel with writer name, operator label, category and evidence link (ticket 10, bullet 3). The verdict is one line of text under the address input.
- No signing surface, no activity list, no override, no maintainer-change prompt (all of ticket 11).
- No Helios header, no Anon-RPC. Same trust level as the Snap.
- Covers Kohaku's public send screen only. dApp `eth_sendTransaction` goes through `src/web/extension-services/background/provider/rpcFlow.ts` and `SignAccountOpController`, and the private Railgun send is `src/web/modules/PPv1/transfer/screens/TransferScreen.tsx` with `useRailgunForm.ts`; neither is touched.
- Ambire is modified (one file). User story 43 and HANDOFF's "Ambire itself is never touched" do not hold.

## Findings

### 1. Smallest hook for a recipient check

The transfer controller computes recipient validity itself. `validationFormMsgs` (`transfer.ts:283-310`) calls `validateSendTransferAddress` (`src/ambire-common/src/services/validations/validate.ts:57-67`), whose own rules already return `success: false` with a sentence for "same address" (:76-81), "smart contract" (:83-88) and "not in address book" (:90-100). A tocsin block is one more such sentence. `isFormValid` (:312-336) and the screen (`TransferScreen.tsx:292-297`, :324) consume it unchanged. Recipient changes arrive through `update()` (:390-399) and `#onRecipientAddressChange` (:440-458), which is where the async evaluation starts.

Files that must change for a hard block: one Ambire file (`transfer.ts`) plus two new files under `libs/tocsin/`. For a warn with correct styling: add `TransferScreen.tsx` and the address input component. So yes, about 100 lines of new code plus 15 lines of edits.

The PhishingController pattern is the wrong template. It touches 13 files (`controllers/phishing/phishing.ts`, `controllers/main/main.ts:365`, `background.ts:1073`, `handlers/handleActions.ts`, `background/types.ts`, `provider/rpcFlow.ts`, `contexts/phishingControllerStateContext/` (2), `hooks/usePhishingControllerState/`, `contexts/controllersStateLoadedContext/`, `app-init/screens/AppInit/AppInit.web.tsx`, `libs/signMessage/signMessage.ts`, `interfaces/storage.ts`), and its consumer is the dApp request flow, not the send screen. Ticket 02 counted this path (five files for the controller alone) and was right about it; it is just not the shortest path.

### 2. Can `@kohaku-eth/plugins` carry this without editing Ambire

No. `Host` is `{ network, storage, keystore, provider }` (`node_modules/@kohaku-eth/plugins/dist/host/index.d.ts:3-8`): a `fetch` (:12-17), plaintext key-value storage (:26-40), BIP-32 key derivation (:67-77) and an EIP-1193 provider. A plugin is `CreatePluginFn = (host, params) => PluginInstance` (`dist/base.d.ts:40`) and a `PluginInstance` exposes only `prepareShield`, `prepareTransfer`, `prepareUnshield` and `balance` (`base.d.ts:10-17`, :33-38). There is no event, no hook on a wallet screen, and nothing that hands a plugin the send-screen recipient. Kohaku builds a `Host` per privacy protocol in `src/ambire-common/src/controllers/railgun/hostFactory.ts:40-58` and the equivalent for privacy pools; the protocol instance is then called by Ambire controllers. The package is at `0.0.1-alpha.5` on every branch checked (`package.json:84`; `origin/dev-wonderland-m12` package.json, same line).

### 3. Reusing Kohaku's provider, ignoring Helios

Yes. The transfer controller holds `#providers: ProvidersController` (`transfer.ts:113`, set at :171, passed from `main.ts:430-442`) and `#networks` (:63). `ProvidersController.providers` is `{ [chainId]: RPCProvider }` (`controllers/providers/providers.ts:15`, `interfaces/provider.ts:13`), and `RPCProvider` has `send(method, params)` (`interfaces/provider.ts:4-5`). With the shipped `RPC_PROVIDER=colibri`, `send` routes every method through Colibri's `request` (`services/provider/ColibriRpcProvider.ts:86-90`), which verifies what it can and falls back for the rest; ticket 02 saw it fail and fall back on every call. Simpler and equal in trust: build the reader's `RpcRequest` on `fetch` against `network.selectedRpcUrl` (`interfaces/network.ts:66`), exactly as Kohaku's Railgun host does with `http(network.selectedRpcUrl)` (`hostFactory.ts:54`). That bypasses Colibri and Helios entirely. `getRpcProvider` (`services/provider/getRpcProvider.ts:41-75`) is not involved.

### 4. Fetching the static list JSON

Partly. `site/lists/default.json` is the list document: maintainer, version, and two writer entries with their categories and `snapshotURI` (lines 4-25). It names writers, not flagged addresses. The reader needs two more things:

- the name record hex, because `acceptList` checks the document's root against the record and recovers the maintainer's EIP-712 signature from it (`dapp/packages/reader/src/lists/index.ts:49-50`, :188-193, :221-236). `dapp/list-record.hex` holds it; its tail decodes to `http://localhost:8000/lists/default.json`, so the demo laptop's `serve` must be up, as for the Snap.
- the leaves. Flagged addresses are `FLAG` leaves in the log, replayed by `sync`, which requires both `proofs` and `leaves` (`dapp/packages/reader/src/sync.ts:15-23`). Leaves can come from `snapshotLeafSource` over `site/mirror/<writer>.json` (the `snapshotURI` values, `default.json:13`, :23), which skips `eth_getLogs`. Proofs cannot: `eth_getProof` for the writers' head and sequence is one RPC call per sync. The Snap's `mirrorSource` (`engine.ts:63-85`) is the 20 lines to copy if the mirror is wanted.

So the minimum RPC traffic is one `eth_getProof` per sync, plus `eth_getLogs` if the mirror is not used, plus one `eth_call` if the record is resolved by ENS instead of hardcoded.

### 5. Build and iterate cost

`yarn web:webkit` (`package.json:11`) is `expo start --web`: a webpack dev server that watches and writes the bundle to `build/webkit-dev` (`webpack.config.js:184-185`, `writeToDisk = true`). Edits under `src/ambire-common/src/` are picked up through the `@ambire-common` alias (`babel.config.js:6`, `tsconfig.json:10`). After an incremental recompile the extension needs a reload at `chrome://extensions`, because the transfer controller runs in the background service worker; a popup-only change needs only a reopen. Cold compile was about 54 s in ticket 02; the incremental time was not measured. Babel strips types, so a type error does not stop the dev build; `package.json` has a `test` script (:50, jest) and no typecheck script. Node `>=22.12.0 <23.0.0` (`package.json:53-55`), `.nvmrc` 22.12.0. The `.env` values from ticket 02 still apply.

### 6. Upstream after 72922ab

Nothing on `origin/main`: after `git fetch origin` (2026-11-06), `HEAD..origin/main` is empty, and `kohaku-commons` `origin/main` is still `29227cc` (2026-07-03). `@a16z/helios` is `0.11.1` on `origin/main`, `origin/dev`, `origin/dev-wonderland-m12` and `origin/feat-pp-root-verification` (`package.json:59`, `src/ambire-common/package.json:38` and the same lines on each branch). No Sepolia or Colibri fix.

One branch ticket 02 did not look at: `origin/dev-wonderland-m12`, 168 commits ahead of main, last commit 2026-11-03. In the extension it changes only `.gitmodules`, `package.json` (viem to 2.54.1, adds `@kohaku-eth/social-recovery`) and the submodule pointer, which moves to `defi-wonderland/kohaku-commons` at `211a00f` (2026-10-27). That commons is 11 commits ahead of `29227cc` and touches `controllers/main/main.ts` (+49/-5), `requests`, `signAccountOp`, `estimation`, `accountPicker` for social recovery. No provider, network, plugin or Host change. Nothing changes the picture; it confirms that even the most active fork adds features by editing Ambire controllers.

## Open risks

- viem skew. The reader is tested on viem 2.57.16 (`dapp/packages/reader/package.json:17`); Kohaku resolves 2.33.x. Every viem function the reader imports exists in 2.33 (`getAddress`, `decodeEventLog`, `encodeEventTopics`, `recoverTypedDataAddress`, `namehash`, `packetToBytes`, `encodeAbiParameters`, `keccak256`), but it has not been run there.
- First sync latency on the send screen. The verdict arrives only after `eth_getProof` and the log scan; until then the field validates as today. Start the sync in the constructor, not on the first keystroke, and say "checking" in the message if `tocsin` is null.
- Service worker restarts drop the in-memory sync. Persisting checkpoints through `this.#storage` (`transfer.ts:61`) is about five more lines; left out of the minimum.
- The `validationFormMsgs` getter runs on every state serialisation. Keep the tocsin branch a synchronous lookup of the stored result.
- Demo laptop dependencies: `serve` on `localhost:8000` for the list and mirror, and an RPC that passes proofs (0xrpc.io, `runbook.md:144`).
- Rule conflict. User story 43 and HANDOFF say Ambire is untouched; this edits `transfer.ts`. Decide that before starting, not after.
