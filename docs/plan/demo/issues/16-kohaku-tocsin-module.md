# 16: Kohaku fork with the tocsin reader, at Snap parity

Spec: `docs/plan/demo/snap-ui.md` (the UI, adapted to Kohaku's components). `docs/plan/demo/issues/15-kohaku-feasibility-research.md` (hook points and minimum change). Ticket 02's Comments (Kohaku hook points). Ticket 12 (the Snap this mirrors).

**What to build:** The tocsin reader inside a fork of Kohaku, doing what the Snap does. Kohaku checks the recipient on its own send screen, the target of dApp transactions and the spender of permits on its signing screens, and keeps a background sync. A settings page holds lists, the RPC and the sync status. Kohaku can stop a send where MetaMask cannot, so a block verdict disables the send button.

**Where:** Kohaku fork worktree `../kohaku-tocsin`, branch `tocsin`, and its submodule `src/ambire-common`, branch `tocsin`. Both branch from the fork's `main` at `72922ab` and `29227cc`. This repo's branch `feat/kohaku` carries this ticket and the docs.

**Blocked by:** None. The decision in ticket 02 is overridden by the team on 2026-11-06: build the Kohaku module, accepting the edits to Ambire files.

**Ethskills:** tools, wallets, frontend-ux

**Status:** ready-for-agent

## Scope

- Same trust level as the Snap: header and proofs from one RPC, best effort, not a light client. No Helios, no Colibri, no Anon-RPC. The honesty line in every panel says so.
- Surfaces: send screen recipient, sign account op (dApp transaction `to` and decoded calldata targets), sign message (EIP-2612 and Permit2 spender). Settings page per `snap-ui.md` section 5, as far as the Snap built it.
- Background sync on start-up and on a timer, persisted through Ambire storage.
- Out: activity list, override timer, Railgun private send, Helios, Anon-RPC, social recovery.

## Conflicts noted

- HANDOFF and spec user story 43 say "Ambire itself is never touched". This ticket edits Ambire controllers and screens by team decision.

## Comments

### 2026-11-06: Core controller

The reader, the Snap's engine, and a `TocsinController` now run in Kohaku's background service worker. The send screen blocks a flagged recipient. No screen or panel is built; that is the UI agents' job, against what follows. Paths are relative to `../kohaku-tocsin`. `src/ambire-common/...` is the submodule, branch `tocsin`. Nothing is committed.

#### Files

Added in the submodule:

- `src/ambire-common/src/libs/tocsin/reader/` holds the reader from `dapp/packages/reader/src/`, copied unchanged.
- `src/ambire-common/src/libs/tocsin/state.ts` holds state types, env constants, `freshState`, `fromStored`.
- `src/ambire-common/src/libs/tocsin/engine.ts` is the Snap engine. `fetch` is a parameter now, and writer errors are stored as strings.
- `src/ambire-common/src/libs/tocsin/decode.ts` and `settings.ts` are the Snap files, copied unchanged.
- `src/ambire-common/src/libs/tocsin/display.ts` holds the UI-independent words from the Snap's `ui.tsx`.
- `src/ambire-common/src/controllers/tocsin/tocsin.ts` is `TocsinController`.
- Tests: `src/ambire-common/src/libs/tocsin/decode.test.ts`, `src/ambire-common/src/controllers/tocsin/tocsin.test.ts`, `src/ambire-common/src/controllers/transfer/transferTocsin.test.ts`, `src/ambire-common/test/helpers/tocsin.ts` (fake Sepolia, lying RPC, list host and ENS, ported from the Snap's bundle test).

Changed in the submodule:

- `src/ambire-common/src/controllers/main/main.ts`: `tocsin: TocsinController`, built after `phishing` and passed to `TransferController` as a new last argument.
- `src/ambire-common/src/controllers/transfer/transfer.ts`: optional `tocsin` constructor argument, a `tocsinRecipient` getter (also in `toJSON`), an evaluation started in `update()` when `addressState` or `selectedToken` changes, and the block in `validationFormMsgs`. `DEFAULT_VALIDATION_FORM_MSGS` gets no new writes; a block returns a fresh object.
- `src/ambire-common/src/interfaces/storage.ts`: `tocsin?: TocsinState` in `StorageProps`.

Added in the extension:

- `src/web/contexts/tocsinControllerStateContext/` (`index.ts`, `tocsinControllerStateContext.tsx`)
- `src/web/hooks/useTocsinControllerState/` (`index.ts`, `useTocsinControllerState.ts`)

Changed in the extension:

- `src/web/extension-services/background/types.ts`: `tocsin: TocsinController` in `controllersNestedInMainMapping`.
- `src/web/extension-services/background/actions.ts`: nine action types.
- `src/web/extension-services/background/handlers/handleActions.ts`: nine cases.
- `src/web/extension-services/background/background.ts`: a sync at start-up and every 5 minutes.
- `src/web/contexts/controllersStateLoadedContext/controllersStateLoadedContext.tsx`: waits for tocsin state.
- `src/common/modules/app-init/screens/AppInit/AppInit.web.tsx`: `TocsinControllerStateProvider` sits just inside `RailgunControllerStateProvider`, around `ControllersStateLoadedProvider`.
- `.env-sample`: four `TOCSIN_*` names, none marked required. `.env` is gitignored and holds the demo values.

The worktree already had changes to `yarn.lock`, `.yarnrc.yml`, `key.pem` and the submodule's `package-lock.json` from installing dependencies. They are not mine.

#### Controller public state

Read it with `useTocsinControllerState()`. It returns the controller's JSON, and bigints survive because the port uses richJson. The types live in `@ambire-common/libs/tocsin/display` and `@ambire-common/libs/tocsin/state`.

```ts
settings: { rpcUrl: string }
lists: ListView[]            // one per list name, followed or not
sync: SyncView | null        // null until the first sync that reached the proof
syncedAt: number | null      // ms
lastGood: { flags: number; writers: number; block: bigint; at: number } | null
names: Record<Address, string>   // forward-checked ENS names of writers
status: { at: number; error?: string } | null   // error = why the last sync failed
isSyncing: boolean
isReady: boolean             // false until stored state loaded
assessments: Record<string, TocsinAssessment>   // key: assessmentKey(target, chainId); memory only
addListCandidate: { name: string; maintainer: Address; version: bigint; writers: Address[] } | null
isFetchingCandidate: boolean
formErrors: { rpcUrl?: string; listName?: string }

ListView = { name; followed: boolean; status?: string; pinned?: ListSummary; pending?: ListSummary }
ListSummary = { maintainer: Address; version: bigint; writers: Address[] }
SyncView = { block: { number: bigint; hash: Hex; unverified?: true }; flags: number;
             writers: Record<Address, { status: 'synced' | 'unavailable'; writer; seq: bigint; head: Hex; divergedAt?: bigint; error?: string }> }
TocsinAssessment = { target: { address; context: 'recipient' | 'spender'; why: string }; chainId: bigint;
                     verdict: 'block' | 'warn' | 'clean' | 'unavailable';
                     findings: { writer; category: number; evidence: Hex; seenBlock: bigint; weight: number; list: string }[];
                     unavailable: Address[] }
```

`ListView.status` is acceptList's status from the last sync: `accepted`, `stale`, `rejected (<reason>)`, `maintainer changed`, or `accepted, new maintainer confirmed`.

The transfer controller adds one field, read with `useTransferControllerState().tocsinRecipient`:

```ts
tocsinRecipient: { address: string; chainId: bigint; verdict: Verdict | 'checking'; message: string; assessment?: TocsinAssessment } | null
```

It is null when there is no valid recipient address or in top-up mode. `chainId` is the selected token's chain, or Sepolia when no token is selected.

#### Controller methods

Background code only. The UI calls them through the actions below.

- `syncNow(): Promise<void>` runs one sync, or joins the one already queued. It never throws; failures land in `status.error`.
- `assess(targets: Target[], chainId: bigint): Promise<TocsinAssessment[]>` checksums and filters the targets, evaluates them, and caches each result in `assessments`. It never throws. With no sync or no usable list, the verdict is `unavailable`.
- `getAssessment({ address, context }, chainId): TocsinAssessment | undefined` is the synchronous cache read.
- `updateSettings({ rpcUrl })`: a bad URL sets `formErrors.rpcUrl`. A new URL drops checkpoints, then syncs.
- `setFollowed(name, followed)`: following again syncs. Unfollowing keeps the pin.
- `addList(name)` resolves and verifies the list, then sets `addListCandidate`, or `formErrors.listName` on failure.
- `confirmAddList()` pins the candidate (first-use pinning), then syncs. `cancelAddList()` drops it.
- `acceptMaintainerChange(name)` turns `pending` into the pin, then syncs.
- `removeList(name)`
- `TOCSIN_SYNC_INTERVAL_MS = 300000` is exported from the controller module.

All mutations run one at a time in a queue. A follow toggle pressed while a sync runs applies after that sync ends, so keep showing `isSyncing`. The queue ensures a timer sync and a user action never overwrite each other.

#### Background actions

Each one is `dispatch({ type, params })` from `useBackgroundService()`.

| type | params |
| --- | --- |
| `TOCSIN_CONTROLLER_SYNC` | none |
| `TOCSIN_CONTROLLER_ASSESS` | `{ targets: Target[]; chainId: bigint }` |
| `TOCSIN_CONTROLLER_UPDATE_SETTINGS` | `{ rpcUrl: string }` |
| `TOCSIN_CONTROLLER_SET_FOLLOWED` | `{ name: string; followed: boolean }` |
| `TOCSIN_CONTROLLER_ADD_LIST` | `{ name: string }` |
| `TOCSIN_CONTROLLER_CONFIRM_ADD_LIST` | none |
| `TOCSIN_CONTROLLER_CANCEL_ADD_LIST` | none |
| `TOCSIN_CONTROLLER_ACCEPT_MAINTAINER_CHANGE` | `{ name: string }` |
| `TOCSIN_CONTROLLER_REMOVE_LIST` | `{ name: string }` |

`Target` is `{ address, context: 'recipient' | 'spender', why }` from `@ambire-common/libs/tocsin/decode`. Results come back through state, never as a return value: after `ASSESS`, read `assessments[assessmentKey(target, chainId)]`.

#### Context and hook

- `TocsinControllerStateContext` and `TocsinControllerStateProvider` from `@web/contexts/tocsinControllerStateContext`
- `useTocsinControllerState` from `@web/hooks/useTocsinControllerState` (default export)

#### Helper module

`@ambire-common/libs/tocsin/display`. Everything takes the tocsin state (`TocsinView`) and assessments.

- Types: `ListSummary`, `ListView`, `WriterView`, `SyncView`, `TocsinFinding`, `TocsinAssessment`, `TocsinView`, `Cause` (`{ title, body }`).
- Copy constants: `PRIVACY_LINE`, `NETWORK_NOTE`, `POLICY_LINES` (two lines), `ABOUT_LINE`, `STANDARD_URL`, `SOURCE_URL`, `CHECKING_LINE`, `UNVERIFIABLE_LINE`.
- Category table: `CATEGORY` and `category(n)`, which returns `{ name, title, desc }`.
- Formatting: `short`, `num` (use it for every bigint), `plural`, `ago(at, now?)`, `host`.
- Verdicts: `RANK`, `worst(items with verdict)`, `usable(listView)`, `isChecking(view)`, `assessmentKey(target, chainId)`.
- Sync rows: `whyUnavailable(writerView)`, `writerLabel(view, address)`, `proven(view)`, `sourceLine(view)`, `syncedLine(view)`, `staleLine(view)` (undefined unless the last sync failed over an older one).
- Panel parts: `notes(view, chainId)` gives warning lines for skipped lists and another chain. `causeOf(view, assessments)` gives the unverifiable banner. `flagBanner(assessment)` gives the block or warn banner. `flaggedBy(view, a)`, `seenLine(view, a)`, `verdictTitle(v)`, `cleanLine(view)`, and `recipientLine(view, a, checking)` (the send screen's one line).

Also useful: `transactionTargets(tx)` and `signatureTargets(typedData)` from `@ambire-common/libs/tocsin/decode`, `parseRpcUrl` and `parseListName` from `.../settings`, and `LOG_CHAIN_ID` from `.../state`.

#### How to show each state

The rules come from `snap-ui.md` sections 2, 3 and 8. Red only on block. Never write "safe" or "clean". Every panel ends with `PRIVACY_LINE`. Under every panel go `syncedLine`, `proven`, `sourceLine`, and `staleLine` when set.

- Checking: `tocsinRecipient.verdict === 'checking'`, or `isChecking(tocsinState)` on signing screens. Show a spinner with `CHECKING_LINE`. Never block. Validation is untouched.
- Block: on the send screen, `validationFormMsgs.recipientAddress` is already `{ success: false, message: tocsinRecipient.message }`. The address input shows it as its error and the button is disabled, with no UI change. For the panel, the title is `verdictTitle('block')`, the banner is danger with `flagBanner(a)`, and the rows are address, role (`a.target.why`), category names, `flaggedBy`, evidence links (`https://sepolia.etherscan.io/tx/<hash>`) and `seenLine`. Add the `notes` lines.
- Warn: an amber banner with `flagBanner(a)`, same rows. Validation does not change, so the UI must render it next to the field. Ticket 15 says the existing success-styled label is the wrong colour.
- No flags: `verdict === 'clean'`. Green, with the title `verdictTitle('clean')`, the banner "Not on any list you follow", and the subtitle `cleanLine(view)`.
- Unverifiable: `verdict === 'unavailable'`. An info (blue) banner from `causeOf(view, [a])`, plus `UNVERIFIABLE_LINE` in warning colour, `lastGood` rows, and a Retry button that dispatches `TOCSIN_CONTROLLER_SYNC`. Never green, never red. The lying-RPC beat lands here: `sync.writers[w].divergedAt` is set, and `causeOf` gives "The RPC's data does not match Ethereum".
- Signing screens: dispatch `TOCSIN_CONTROLLER_ASSESS` with `transactionTargets({ to, data })`, or `signatureTargets(typedData).targets` and its `chainId`. Then read each key from `assessments` and take `worst(...)`. Signing screens do not block yet; only the send screen does.
- Settings page (`snap-ui.md` section 5):
  - Status: `sync.flags` and the writer count, `proven`, `ago(syncedAt)`, `sourceLine`, a `whyUnavailable` row for each failing writer, a "Last sync failed" banner from `status.error`, a spinner on `isSyncing`, and a Sync now button.
  - Lists: one card per `lists[]` entry. Show the follow toggle and Remove. When `pending` is set, show a warning banner "Maintainer changed" and a Review dialog that compares `pinned` with `pending`, then calls Accept.
  - Add: the form dispatches `ADD_LIST` and shows `formErrors.listName`. When `addListCandidate` is set, show a confirm dialog with maintainer, writer count and version, then Confirm or Cancel.
  - Network: `settings.rpcUrl`, `formErrors.rpcUrl`, `NETWORK_NOTE`.
  - Policy: `POLICY_LINES`. About: `ABOUT_LINE` and the links.

#### Env

`TOCSIN_RPC_URL`, `TOCSIN_LIST_NAME`, `TOCSIN_LIST_RECORD`, `TOCSIN_LOG_FROM_BLOCK`. The worktree's `.env` holds `https://0xrpc.io/sep`, `tocsin.eth`, the record from `dapp/list-record.hex` (its `listURI` is `http://localhost:8000/lists/default.json`), and `12074077`. Babel's `transform-inline-environment-variables` inlines them into `background.js` at build time; I checked that all four values are in the bundle. Restart `yarn web:webkit` after editing `.env`. The manifest already allows `http://*/*` and `https://*/*`, and the CSP sets only `script-src`, so the service worker can reach the RPC and localhost:8000 with no change. The controller uses plain `fetch`, not `mainCtrl.fetch`, because that one adds an `x-app-source` instance id to every request.

#### Results

Commands run from `../kohaku-tocsin`, each prefixed with `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH;`.

- Reader on Kohaku's viem 2.33.2: 62 of 62 of the reader's own vitest tests pass under the submodule's jest, with `vitest` mapped to `@jest/globals`. No change to the reader was needed, so I found no incompatibilities. The harness is a throwaway jest config in my scratch directory. The CLI test there runs antibody's own `tsx`.
- `SEPOLIA_RPC_URL=https://0xrpc.io/sep npm --prefix src/ambire-common run jest -- 'src/(libs/tocsin|controllers/tocsin|controllers/transfer/transferTocsin)'` gives 3 suites, 25 tests, all passing. Covered: the Snap's decode and settings tests; block, warn and no flags; the lying RPC as unverifiable at `divergedAt` 1, then a block again on the honest RPC; a maintainer change held as pending and then accepted; follow, unfollow and remove; an RPC on another chain; a restart from storage with no evaluated address stored; the add-list candidate and its errors; the transfer block message and `isFormValid` false; and "checking" during the first sync with no block.
- `tsc` over the touched submodule files, with a scoped config extending `src/ambire-common/tsconfig.json`: no errors in any touched file. Three pre-existing errors remain in `swapAndBridge.ts:611` and the hardhat imports in `test/config.ts` and `test/helpers.ts`.
- `tsc` over the touched extension files, with a scoped config extending `tsconfig.json`: 79 errors, all pre-existing (for example `background.ts:48`, `handleActions.ts:189`) and none on a changed line.
- `yarn web:webkit` printed "web compiled successfully". I stopped it after that.

#### Left out

- Screens and panels, including the signing-screen calls to `assess`: those are for the UI agents.
- A block on the signing screens. Only the send screen blocks.
- `TOCSIN_LIST_RECORDS` (records for several names). The task named four env names, and only the first default name gets a record override.
- The leaf-source switch: the current Snap has none, and every read goes to `settings.rpcUrl`.
- The default RPC is `https://0xrpc.io/sep`, not the Snap's publicnode, because of `runbook.md:144`.
- `causeOf` says "Open Tocsin in Settings" where the Snap says "Snaps menu". Change it if the settings route gets another name.
- `setInterval` dies with the service worker. The next start-up sync covers the gap; `chrome.alarms` would be the upgrade.
- `env.d.ts` (`@env`) is unchanged, because the code reads `process.env` the way `consts/testnetNetworks.ts` does.
- The existing network-bound suites (`transfer.test.ts`, `main.test.ts`) were not run. The new constructor argument is optional, so their calls still typecheck.

### 2026-11-06: Settings page

The Snap's home page now lives in Kohaku's settings, as a "Tocsin" entry. Paths are relative to `../kohaku-tocsin`. Nothing is committed. The controller, `display.ts` and the background were not touched.

#### Files

- Added `src/web/modules/settings/screens/TocsinSettingsScreen/` (`TocsinSettingsScreen.tsx`, `index.ts`).
- `src/common/modules/router/constants/common.ts`: `tocsinSettings: 'settings/tocsin'`.
- `src/common/modules/router/config/routesConfig/routesConfig.ts`: title and name "Tocsin".
- `src/web/modules/router/components/MainRoutes/MainRoutes.tsx`: the route inside `SettingsRoutesProvider`.
- `src/web/modules/settings/components/Sidebar/Sidebar.tsx`: a `SETTINGS_LINKS` entry, key `tocsin`, label "Tocsin", `WarningIcon`, after Networks. The popup's Menu screen reads the same array, so the entry shows there too.

#### Route

`settings/tocsin` (`ROUTES.tocsinSettings`). `causeOf` already says "Open Tocsin in Settings", which matches, so `display.ts` is unchanged.

#### Sections and actions

Built from Kohaku's settings parts: `SettingsPageHeader`, `Alert`, `Input`, `FatToggle`, `Button`, `Spinner`, cards in `secondaryBackground` like `ControlOption`.

- Status: the header holds Sync now (`TOCSIN_CONTROLLER_SYNC`, disabled while `isSyncing`) and a spinner with "Syncing…". Rows are flags across N writers, proven head (`proven`), last sync (`ago(syncedAt)`), source, and one warning row per failing writer (`writerLabel`, `whyUnavailable`). `status.error` shows a warning Alert "Last sync failed".
- Lists: one card per `lists[]` entry, with name, maintainer, writer count and version, and "Last check: <status>" when not accepted. The "Follow this list" toggle dispatches `SET_FOLLOWED`. Remove dispatches `REMOVE_LIST` with no confirm, as in the Snap. When `pending` is set, a warning Alert "Maintainer changed" has a Review button. Review opens, inside the card, the Snap's maintainer dialog: pinned and new maintainer and version. Accept dispatches `ACCEPT_MAINTAINER_CHANGE`.
- Add: the "Add a list by ENS name" input shows `formErrors.listName` under the field. Add dispatches `ADD_LIST` and reads "Checking…" while `isFetchingCandidate`. When `addListCandidate` is set, a confirm card shows maintainer, writer count and version. Confirm dispatches `CONFIRM_ADD_LIST` and clears the input. Cancel dispatches `CANCEL_ADD_LIST`.
- Policy: `POLICY_LINES`, as the Snap shows them.
- Network: the "RPC URL" input shows `formErrors.rpcUrl` under the field. Save and sync dispatches `UPDATE_SETTINGS`, disabled while syncing. The Snap's "Use Kohaku for full verification" line is replaced, in the screen file, with: "This build reads the header and proofs from the RPC you pick, best effort. It is not a light client and does not use Anon-RPC. The RPC can see which flags you download, never which address you check."
- About: `ABOUT_LINE`, then "Read the standard" (`STANDARD_URL`) and "Source" (`SOURCE_URL`), both opened with `openInTab`, then "Flag log on Sepolia".

#### Results

- `tsc -p` with a scoped config extending `tsconfig.json` over the six touched files, from `../kohaku-tocsin` with the node 22.14.0 PATH: no errors in any touched file. The one error left is the config's own `reflect-metadata` type root, which a scoped config cannot resolve.
- `prettier --check` passes on the touched files.
- No build run, as asked. No jest test: the screen holds no logic outside React.

#### Left out

- A dashboard entry. Kohaku's dashboard has no natural spot, and the settings sidebar and the popup Menu both list Tocsin.
- The install dialog (snap-ui section 6). The status section covers it.
- The confirm and review steps are inline cards, not `BottomSheet` modals. That avoids opening a modal from a background state change.
- `formErrors` stays until the next submit, because the controller only clears it then.
- `FatToggle` hides its checkbox with `display: none`, so the follow toggle is mouse-only. It is the house component; a keyboard fix belongs in `Toggle.web.tsx`.
- Not rendered in a browser. A QA agent builds next.

### 2026-11-06: Send and sign panels

One verdict panel now sits on the send screen, the dApp transaction screen and the sign message screen. A block disables the button on all three, and the controller refuses to sign as well. Paths are relative to `../kohaku-tocsin`. Nothing is committed.

#### Files

Added:

- `src/web/modules/tocsin/components/VerdictPanel/` (`VerdictPanel.tsx`, `index.ts`)
- `src/ambire-common/src/libs/tocsin/check.ts`: `tocsinCheck(cache, targets, chainId)` gives `{ chainId, verdict, assessments }`. The verdict is the worst over the targets, or `checking` until every target has an assessment. It also exports `uniqueTargets`, `BLOCKED_SEND_LINE` and `BLOCKED_SIGN_LINE`.
- `src/ambire-common/src/controllers/signAccountOp/signAccountOpTocsin.test.ts`
- `src/ambire-common/src/controllers/signMessage/signMessageTocsin.test.ts`

Changed:

- `src/web/modules/transfer/components/SendForm/SendForm.tsx`: the panel under the recipient field.
- `src/web/modules/transfer/screens/TransferScreen/TransferScreen.tsx`: on warn or unverifiable, the address input gets the tocsin line as an amber warning.
- `src/common/components/AddressInput/AddressInput.tsx`: an optional `isWarning` on `AddressValidation`. It renders the message in `warningText` with amber borders, and it never blocks.
- `src/web/modules/sign-account-op/screens/SignAccountOpScreen/SignAccountOpScreen.tsx`: the panel at the top of the scroll view.
- `src/web/modules/sign-message/screens/SignMessageScreen/SignMessageScreen.tsx`: the panel on block or warn only, and Sign disabled on block.
- `src/ambire-common/src/controllers/signAccountOp/signAccountOp.ts`: an optional `tocsin` constructor argument (last), plus the `tocsinTargets` and `tocsin` getters (`tocsin` is also in `toJSON`). A block makes `readyToSign` false and `sign()` refuse. Changed calls are assessed again in `update()`, and `reset()` unsubscribes.
- `src/ambire-common/src/controllers/signMessage/signMessage.ts`: an optional `tocsin` constructor argument (last), plus the `tocsinTargets` and `tocsin` getters, `init()` starting the assess, the block in `#sign()`, and a `toJSON` that adds `tocsin`.
- `src/ambire-common/src/controllers/main/main.ts`: `tocsin` is built before `signMessage` and passed to it, and to the dApp `SignAccountOpController` only. Swap, Railgun, privacy pools and the transfer's own sign op get no tocsin.
- `src/ambire-common/src/libs/tocsin/decode.ts` and `src/ambire-common/src/controllers/tocsin/tocsin.ts`: these were outside my lane, so I kept the edits to one line each. `Target.context` now allows `'delegate'`, and `cleanTargets` passes it through instead of turning it into `recipient`. Without that, a 7702 delegate is checked as a recipient, and MALICIOUS_DELEGATE (category 4, delegate context only) can never fire.

#### How each surface decides and blocks

- Send screen: the panel renders `useTransferControllerState().tocsinRecipient`, with `[assessment]` or `[]` while checking. The core's block was already wired, and I confirmed it. `validationFormMsgs.recipientAddress` fails, `useAddressInput` gets it as `overwriteError`, `validation.isError` is true, and both `isTransferFormValid` and `isFormValid` are false, so Send is off. Before this change, warn and unverifiable left the input's green "Valid address" showing. They now show `tocsinRecipient.message` in amber.
- dApp transaction: the targets are `transactionTargets(call)` for every call, plus `getContractImplementation(chainId)` as `delegate` when `meta.setDelegation === true` or `baseAccount.shouldSignAuthorization(byBundler)`. Duplicates are dropped. The controller calls `tocsin.assess` on construction and when calls change. It re-emits only when the verdict string changes. On block, `readyToSign` is false, so `useSign`'s `isSignDisabled` turns Sign off, and `sign()` emits `BLOCKED_SEND_LINE` and returns before asking for a signer.
- Sign message: for `typedMessage`, the target is `signatureTargets({ primaryType, domain, message })` (EIP-2612 `Permit`, Permit2), on the domain chain or else the request chain. For `authorization-7702`, it is `content.contractAddr` as `delegate`. Personal sign has no target, so `tocsin` is null and nothing shows. The panel shows only on block or warn (snap-ui section 4). On block, `resolveDisabled` is true and `#sign()` rejects with `BLOCKED_SIGN_LINE` before `getSigner`.
- The panel states: checking, blocked, warning, no flags, unverifiable, and "No address in this request to check." Each one ends with the synced, proven and source rows, plus `staleLine` when set and `PRIVACY_LINE`. All copy comes from `display.ts` or `check.ts`. A block reads "Sending is blocked. Tocsin flagged an address in this transaction." or "Signing is blocked. Tocsin flagged an address in this signature." in place of the Snap's "Reject this …". Banners are `Alert`, red only on block. The address is `BaseAddress`, which has explorer and copy in its tooltip. Category descriptions sit in a `Tooltip` on an info icon. Evidence links to `sepolia.etherscan.io/tx/<hash>` and has `CopyText`. Unverifiable has Retry sync (`TOCSIN_CONTROLLER_SYNC`), which is disabled while syncing. A block or warn panel has `accessibilityRole="alert"`.

#### Results

Each command was prefixed with `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH;`.

- `SEPOLIA_RPC_URL=https://0xrpc.io/sep npm --prefix src/ambire-common run jest -- 'src/(libs/tocsin|controllers/tocsin|controllers/transfer/transferTocsin|controllers/signAccountOp/signAccountOpTocsin|controllers/signMessage/signMessageTocsin)'`: 5 suites and 29 tests, all passing. That is the core's 25 plus 4 new tests:
  - A dApp op that calls `approve(SPENDER)` decodes to recipient plus spender and reaches `block`. `readyToSign` stays false even after a forced ReadyToSign. `sign()` asks the keystore for no signer and emits `BLOCKED_SEND_LINE`.
  - The same op with an unflagged spender is ready to sign.
  - A Permit to SPENDER reaches `block`, and `sign()` asks for no signer and emits `BLOCKED_SIGN_LINE`.
  - A Permit to CLEAN goes on to the signer. A 7702 authorization targets its `contractAddr` as `delegate`.
  - Jest prints "worker failed to exit gracefully". `GasPriceController`'s 4 s bundler timer is still pending when the test ends. The core suites force-exit the same way.
- `tsc -p` with a scoped config that extends `tsconfig.json` over the seven touched extension files: no error in any touched file. All 78 remaining errors are pre-existing, in other files.
- `tsc -p` with a scoped config that extends `src/ambire-common/tsconfig.json` over the touched submodule files and both tests: only the three pre-existing errors (`swapAndBridge.ts:611` and the hardhat imports).
- `prettier --check` passes on the new files and on the touched UI files. `eslint` reports nothing new on the touched files.

#### Left out

- No build and no browser render. The QA agent builds next.
- The Tocsin mark beside the heading. Kohaku has no such asset, and I did not add an SVG.
- `HumanizerAddress` would have been the obvious address component. I did not use it, because it fetches `cena.ambire.com/api/v3/contracts/<address>` for unknown addresses, which breaks "Nothing was sent to anyone". `BaseAddress` does no lookup.
- No tocsin for the transfer's own `SignAccountOpController`, because the send screen already blocks. Swap, Railgun and privacy pools also go unchecked.
- The 7702 delegate on a dApp op is always Kohaku's own implementation, so it will normally come back with no flags. The test fixture has no category 4 flag, so no test shows a delegate block.
- The panel takes a single action word, "send" or "sign". Adding a dApp tx to the batch is still allowed on block, but the batch is checked again when it is signed.

### 2026-11-06: QA pass

I built the worktree and loaded `build/webkit-dev` in Playwright 1.52 Chromium. I used a scratch profile and a fresh throwaway account from onboarding, then ran the beats against live Sepolia. A CDP session on the service worker logged console and network. Screenshots are in `/private/tmp/claude-501/-Users-menghongho-Downloads-projects-hackathon-antibody/6bc7aaad-3726-4f9d-b242-25f746f5790e/scratchpad/kohaku-qa/shots/`. File names below are in that folder. Nothing is committed. No seed phrase or key was written anywhere.

#### Steps

1. **Jest: pass.** The tocsin set from "Send and sign panels" gives 5 suites and 29 tests, all passing. My fixes touch only UI files, so I did not rerun it.
2. **Build: pass.** `yarn web:webkit` printed "web compiled successfully" with no errors, and again after each fix.
3. **Start-up sync: pass, after an environment fix.** The first sync failed with "no usable list for the followed names yet". `localhost:8000/lists/default.json` returned 404. Another `python -m http.server 8000` was running from the antibody repo root on `[::1]:8000`. I did not start it. Chromium resolved `localhost` to `::1` and reached that server, not mine on `127.0.0.1:8000`. I mapped `localhost` to `127.0.0.1` with `--host-resolver-rules` and left the other server running. After that, the start-up sync reached block 12,075,240 with 47 flags. Both writers synced, and `manual.tocsin.eth` resolved. CSP, CORS and env were fine. All four `TOCSIN_*` values were in the bundle.
4. **Settings: pass, with one fix.** See `10-settings.png`, `11-settings-bad-rpc.png`, `12-toggle-focus.png` and `13-unfollowed.png`. The status rows are filled. The list card shows the name, maintainer `0x606E…9DE1`, "2 writers" and version 1. That is a writer count, as in snap-ui 5.2, not a list of addresses. Sync now showed "Syncing…" and moved the head from 12,075,265 to 12,075,279. `ftp://nope` shows "Enter an https URL (http only for localhost)." The follow toggle was mouse-only, as the settings agent said: Shift+Tab went from the Add field to Remove and skipped it. After the fix, Tab reaches it and Space toggles it. Storage went from `followed: true` to `false` and back, and a focus ring shows.
5. **Beat 1, honest RPC: pass.** The scratch account had no tokens, so Kohaku disables the whole send form (`SendForm.tsx:102`). I imported the manual writer `0x1D3B86A924ffb140bdD74Ee6a7533921ed141583` as a view-only account. That uses only its public address, and it holds 0.049 Sepolia ETH. Pasting the drainer receiver shows the Blocked panel (`21-beat1-blocked.png`, `22-beat1-blocked-panel.png`). It has the address, role, DRAINER_RECEIVER, "manual.tocsin.eth · via tocsin.eth", the evidence link, "seen", the synced, proven and source rows, and the privacy line. The Send button had `aria-disabled="true"` and `pointer-events: none`. It stayed that way after I ticked Ambire's own "Confirm sending to this address". `0x…dEaD` shows "No flags" in green (`23-beat1-clean.png`). Send had `aria-disabled="true"` until the confirm tick, which is Ambire's unknown-address rule, and no `aria-disabled` after it. The account is view-only, so an enabled Send only means the form is valid.
6. **Beat 2, lying RPC: pass, after one fix.** The extension reached `http://127.0.0.1:8550` with no block, and the proxy logged its dropped log. Settings showed 25 flags and "manual.tocsin.eth, chain mismatch at sequence 1" (`30-beat2-settings.png`). The send screen shows Unverifiable, "The RPC's data does not match Ethereum", last good, "replayed manual.tocsin.eth · chain mismatch at sequence 1", and Retry sync. It is never green. Bug: the cause banner was red (`31-beat2-unverifiable.png`). After the fix it is neutral (`32-beat2-unverifiable-fixed.png`). Send had `aria-disabled="true"` before the confirm tick and none after it. That is the spec: unverifiable never blocks. Retry sync sent a full sync to the proxy, was disabled while it ran, and the verdict stayed Unverifiable. Before the confirm tick, the field shows Ambire's red "This address isn't in your Address Book" in place of the amber tocsin line. The amber line appears only after the tick, because `TransferScreen.tsx` swaps the message only when validation has no error.
7. **Beat 3: pass.** I saved `https://0xrpc.io/sep` in settings, which syncs (`40-beat3-settings.png`), then pasted again: Blocked (`41-beat3-blocked.png`). Send had `aria-disabled="true"` before and after the confirm tick.
8. **Sign screens: pass, with one fix and a caveat.** A local test page on `127.0.0.1:8017` called `window.ethereum` as the view-only account. Two findings:
   - The dev build reloads every dApp page in a loop. The injected inpage script carries webpack HMR, which fetches `/<chunk>.<hash>.hot-update.json` from the page's own origin, gets a 404, and reloads: 98 reloads in 5 s. It starts after any rebuild while the dev server runs. My test server served those files from the build folder to stop it.
   - An EIP-2612 Permit to the drainer spender shows Blocked, role "EIP-2612 permit spender", DRAINER_SPENDER, and `button-sign` with `aria-disabled="true"`. Bug: the panel sat beside the request and hid it (`51-permit-blocked.png`). After the fix it sits above the request (`52-permit-blocked-fixed.png`). An `eth_sendTransaction` to the drainer receiver shows Blocked on the sign-account-op screen, and `transaction-button-sign` has `aria-disabled="true"` (`53-dapp-tx-blocked.png`).
   - Caveat: a view-only account disables Sign anyway, so these runs cannot show tocsin alone disabling it. The `signAccountOpTocsin` and `signMessageTocsin` tests cover that. "Start a batch" stays enabled on a blocked dApp transaction, as the panels section already says. After the connect, Kohaku opened two Railgun "PPv1Transfer … fundBanner" tabs of its own.
9. **Network: pass for tocsin. Kohaku itself leaks the recipient.** The service-worker trace lists these hosts with request counts:

| Host | Requests | Who |
| --- | --- | --- |
| ethereum-sepolia-rpc.publicnode.com | 1965 | Kohaku |
| ethereum-sepolia-beacon-api.publicnode.com | 809 | Kohaku (Colibri) |
| sepolia.colibri-proof.tech | 619 | Kohaku |
| api.pimlico.io | 238 | Kohaku |
| 0xrpc.io | 91 | tocsin: eth_chainId 11, eth_getBlockByNumber 20, eth_getProof 10, eth_getLogs 20, eth_call 30 |
| relayer.ambire.com | 84 | Kohaku |
| cena.ambire.com | 67 | Kohaku |
| 127.0.0.1:8550 | 30 | tocsin, beat 2 |
| localhost:8000 | 14 | tocsin, only `/lists/default.json` |
| rail-squid.squids.live | 6 | Kohaku |
| api.github.com, raw.githubusercontent.com | 8 | Kohaku phishing lists |
| dw.0xbow.io | 1 | Kohaku |

Tocsin contacted only the configured RPC and `localhost:8000`, and no tocsin request carried an evaluated address. It never fetched the mirror files. Kohaku's own code did send evaluated addresses. The drainer receiver went to publicnode in 111 requests (`eth_estimateGas` from the send form, plus `eth_call`) and to Colibri in 71. `0x…dEaD` went out 9 times and the drainer spender twice. So the panel's "Checked on this device. Nothing was sent to anyone." holds for the tocsin check only. The wallet sends the recipient to its RPC as soon as the form has an amount. The UI page's own traffic was not traced, and tocsin runs only in the service worker.

#### Bugs fixed

- The follow toggle could not be reached by keyboard. `src/common/components/Toggle/Toggle.web.tsx`: the checkbox is now visually hidden (absolute, opacity 0, 1 px) instead of `display: none`. The label gets `position: relative`. `onFocus` and `onBlur` draw a 2 px outline on the track only when the checkbox matches `:focus-visible`. This is the house component, so every Kohaku toggle gains keyboard access and the ring. Mouse behaviour is unchanged.
- The unverifiable banner was red. Kohaku's theme makes `info` red (`themeConfig.ts:123`, `#D01C15`). `src/web/modules/tocsin/components/VerdictPanel/VerdictPanel.tsx` now draws the cause as a neutral box: secondary border and background, a grey info icon, primary title, secondary body, `accessibilityRole="alert"`. The amber subtitle is unchanged.
- The sign message panel hid the request. `TabLayoutContainer` lays its children in a row (`TabLayoutWrapper.tsx:101`). `src/web/modules/sign-message/screens/SignMessageScreen/SignMessageScreen.tsx` now wraps the panel and the request content in one column `View`.

`prettier --check` passes on all three files. A scoped `tsc` shows no error in the two screen files. In `Toggle.web.tsx` it reports line 52 (the track style) and line 92 (the knob style). Both come from spreading `trackStyle` or `toggleStyle`, typed `CSSProperties | ViewStyle`, into a DOM `style`. I did not touch line 92, so both are very likely pre-existing, but I did not typecheck HEAD to confirm.

#### Left for a human before the demo

- Make sure nothing else listens on port 8000 on either stack, or the list fetch hits the wrong server. Today an `http.server` from the antibody repo root holds `[::1]:8000`.
- Don't run a dApp against the dev build after a rebuild without reloading the extension, or use a production build. Otherwise the HMR reload loop hits every dApp page.
- Decide on the privacy line. Kohaku's gas estimate and simulation send the recipient to publicnode and Colibri, whatever tocsin does.
- Unverifiable and "checking" never block, as specified. On the lying RPC, Send turns on after Ambire's confirm tick. Make sure the beat 2 script says that out loud.
- Cosmetic: a blocked recipient still shows Ambire's "Confirm sending to this address" checkbox and "+ Add to Address Book". Send stays off.
- Not done: the sign screens with a funded account that holds keys, which would show tocsin alone disabling Sign; the 360 px popup layout; the warn verdict (`0xCd26…913d`) in the browser; adding a list by ENS name; the maintainer-change dialog.

### 2026-11-06: Where this stands, and next steps

Code lives in `../kohaku-tocsin`, a git worktree of `../kohaku-extension` (the untouched clone of `ethereum/kohaku-extension` at `72922ab`). Branch `tocsin` there, and branch `tocsin` in its submodule `src/ambire-common` (kohaku-commons at `29227cc`). Nothing is committed or pushed. `antibody/dapp/packages/extension` is our separate provider-proxy host, not Kohaku. This branch, `feat/kohaku`, was fast-forwarded to `feat/demo` at `39b1b9e`.

Parity gap. `feat/demo` moved the Snap ahead after the port (commit `c09f648`): a Policy section (block threshold of 1 or 2 writers, warn-only categories, approvals toggle) passed to the reader as an optional policy, and a token context that checks an ERC-20 contract against `MALICIOUS_TOKEN`. Commit `26a3892` added the curator lists `harborwatch.eth` and `lanterndao.eth` with their own record files. Kohaku's reader copy now differs in `evaluate.ts` and `index.ts`. Its list record still matches `dapp/list-record.hex`, so the beats still pass.

Proposed way into this repo, not started: a `dapp/packages/kohaku/` folder holding two patch files (extension and kohaku-commons, new files included), a setup script that clones both at the pinned commits, applies the patches and copies `dapp/packages/reader/src` in at setup time so the reader never drifts, and a README with Node 22, the `.env` keys and the beats.

Decisions waiting on the team: the privacy line wording ("Tocsin checked this on your device" is one truthful option), and whether Unverifiable should also block Send in Kohaku (one line in the transfer controller).

### 2026-11-06: Patches in this repo

Done as proposed, in `dapp/packages/kohaku/`. `update-patches.sh` exported 25 extension files and 18 kohaku-commons files from `../kohaku-tocsin`, through a throwaway git index so new files are included and the clone's index is untouched. It leaves out `yarn.lock`, `package-lock.json`, `key.pem`, `.yarnrc.yml` and the reader copy. The QA build had run on a global yarn 4 from mise, which rewrote Kohaku's yarn 1 lockfile into berry format and added `.yarnrc.yml`. `setup.sh` pins `npx yarn@1.22.22` instead. Upstream's `yarn.lock` is already out of date at `72922ab`, so `--frozen-lockfile` fails and the script runs a plain install. The submodule uses `npm ci`.

Checked from a fresh clone in the session scratchpad. The script ran clean in about four minutes. The resulting tree matches `../kohaku-tocsin` except `reader/evaluate.ts` and `reader/index.ts`, which are now the current reader with policy and the token context, plus `.env` comments. The 5 tocsin jest suites pass (29 tests) against that reader, given `SEPOLIA_RPC_URL` in the env. `yarn web:webkit` printed "web compiled successfully", and `background.js` contains the tocsin code. I did not load that build in a browser or rerun the beats on it. The dapp's yarn 4 workspace list ignores the folder, because it has no `package.json`.

`../kohaku-tocsin` is now just a working clone. A clone made by `setup.sh` works the same way, with branch `tocsin` checked out in both repos.

### 2026-11-06: Anon-RPC in Kohaku

Tocsin's reads in Kohaku now leave through the Anon-RPC worker, the same `@anon-rpc/browser-harness@0.4.0` and tor-js specifier as the harness page and the provider-proxy extension. Kohaku's own reads are untouched. Ticket 17's research had said the wallet could not do this; what it found was that upstream does not, which is a different thing.

The wiring, all in the extension patch plus one seam in the commons patch:

- `src/web/extension-services/tocsin-offscreen/offscreen.ts`, a new webpack entry and offscreen document. It starts a mainnet Helios from the pinned checkpoint, boots the worker with `bootstrapAnonRpc` so the hash it checks the bundle against is light-client verified, and answers fetches over a named port. The harness's isolation frame is `anon-boot.html`, a manifest sandbox page, because the extension CSP blocks the default inline frame.
- `src/web/extension-services/background/tocsinAnonRpc.ts`, the service-worker side: opens the offscreen page at start-up, relays each fetch over `chrome.runtime.connect({ name: 'tocsin-offscreen' })`, honours the controller's abort signal, and sends localhost URLs direct (the lying proxy and the list server, which a Tor exit cannot reach anyway). `waitForTocsinWorker` polls a status message so the first sync starts when the worker is ready instead of timing out at 20 seconds.
- `MainController` takes an optional `tocsinFetch`, the one-line seam in kohaku-commons. The controller is unchanged.
- `manifest.json` gains the `offscreen` permission, the sandbox page and its CSP; `webpack.config.js` keeps that CSP in `processManifest`, adds the entry, the HTML page, and copies `iframe-boot.js` from the package.
- `setup.sh` copies `dapp/packages/nextjs/utils/harness` (the Helios and worker helper and the pinned bootstraps) into the clone like the reader, and writes four new `.env` keys: `TOCSIN_TRANSPORT`, `TOCSIN_TOR_GATEWAYS`, `TOCSIN_MAINNET_CONSENSUS_RPC`, `TOCSIN_MAINNET_EXECUTION_RPC`. `bootstrapAnonRpc` in the shared helper got an optional `iframeUrl`.
- The source line on the verdict panel and the settings page reads "RPC traffic through the tor Anon-RPC worker", or "direct to the RPC, not anonymised" for a localhost URL or a `direct` build.

Two things cost time. First, `chrome.runtime.sendMessage` from the service worker is answered by Kohaku's own tab page before the offscreen document, with an empty reply, so the first version of the relay saw "the Tocsin Anon-RPC page did not answer". A named port fixed it. Second, the first sync used to fire before the worker had booted and hit the controller's 20-second timeout; now it waits.

Run on 2026-11-06 in a Chrome driven by the chrome-devtools CLI, with the local `tor-js-gateway`, the static site on 8000 and the lying proxy on 8550. The service worker made no request to `0xrpc.io`; the gateway log showed the worker's WebRTC connection and Tor tunnels within two seconds of the first sync. The three beats passed on the view-only account `0x1D3B…1583`:

1. Honest RPC over Tor: Blocked, Send disabled, source "0xrpc.io · RPC traffic through the tor Anon-RPC worker".
2. Lying proxy: settings show "manual.tocsin.eth · chain mismatch at sequence 1"; Send shows Unverifiable with the replay text and source "127.0.0.1:8550 · direct to the RPC, not anonymised".
3. Back to 0xrpc.io: the first Sync now failed with "request to 0xrpc.io failed" while a circuit was built, the second synced 49 flags at block 12,076,628, and Send shows Blocked again.

Not done: Nym was not tried in Kohaku (the build switch exists). The settings page does not show the worker hash or the boot stage; a boot failure only shows as the first sync's error. The proof read through the lying proxy still hits publicnode's "block not found" about one time in six, the same as the Snap, because the proxy forwards to `RPC_URL` in `packages/infra/.env`.
