# MetaMask Snap: UI spec

What the Tocsin Snap shows, where, in which order, and in which words. Written against the MetaMask Snaps SDK as documented on 6 Nov 2026. The mock in `design/kit/mocks.html` (middle panel) is the look we want; this document says which parts of it a Snap can actually do and what to do instead where it cannot.

Visual mock of every state below, drawn in MetaMask's theme: `design/kit/snap.html` (serve the repo root and open it), still at `design/screens/snap-screens.png`.

Companion: `docs/plan/demo/issues/12-metamask-snap.md` (the build ticket) and `docs/wallet-integrations.md` section 2 (scope and trust level).

## 1. What a Snap can and cannot do

Read this before the screens. Every screen below is built from this list only.

Can:

- Show a panel in the transaction confirmation window under a tab named after the Snap (`onTransaction`, permission `endowment:transaction-insight`). Set `allowTransactionOrigin: true` to also receive the dapp origin.
- Show a panel on signature requests (`onSignature`, `endowment:signature-insight`), but only when `severity` is `Critical`. MetaMask hides signature insight content otherwise. So the signature panel exists only for flagged spenders.
- Build UI from these components: `Box`, `Section`, `Card`, `Container`, `Footer`, `Heading`, `Text` (colors: default, alternative, muted, error, success, warning), `Bold`, `Italic`, `Row` (label variants: default, error, warning), `Value`, `Address` (jazzicon plus truncated address), `Avatar`, `Banner` (severity: danger, info, success, warning), `Icon` (named icons from the SDK's `IconName` enum, colors: default, primary, muted), `Image` (inline SVG only, no remote URLs), `Link`, `Copyable`, `Tooltip`, `Divider`, `Skeleton`, `Spinner`.
- Interactive components, in insight panels and on the home page: `Button`, `Form`, `Field`, `Input`, `Dropdown`, `RadioGroup`, `Checkbox`, `Selector`. Events arrive in `onUserInput`; the panel is redrawn with `snap_updateInterface`.
- A home page (`onHomePage`, `endowment:page-home`) reached from the Snaps menu in MetaMask. This is the only place for settings. There is no `onSettingsPage` entry point in the current SDK.
- Persist state with `snap_manageState`. Run a background sync on a schedule with `endowment:cronjob` (per-run timeout 60 s by default, up to 180 s with `maxRequestTime`). Run a first sync on install with `endowment:lifecycle-hooks`.
- Fetch with `endowment:network-access`. Read through MetaMask's own network with `endowment:ethereum-provider` (fewer methods than a dapp's `window.ethereum`; `eth_getProof` and `eth_getLogs` go through MetaMask's configured RPC for the chain).
- Open a confirmation dialog with `snap_dialog`.

Cannot:

- Disable, hide, or relabel MetaMask's Confirm button. The greyed-out Confirm in the mock is not possible. A Snap can only warn. The `severity: "critical"` modal that interrupts confirmation is Flask-only; do not depend on it in the demo build. Use a `Banner` with severity `danger` at the top of the panel and say "Reject this transaction" in words.
- Run a Web Worker or an iframe. The anon-rpc browser harness needs one, so the Snap cannot route through anon-rpc. The transport line must say which RPC host served the data and must never say "anonymised."
- Run a light client in the demo window. WebAssembly is available (`endowment:webassembly`), but embedding Helios in a Snap is out of scope for the hackathon. The header comes from an RPC, and the panel says so.
- Pick fonts, custom colors, or custom layouts. Everything inherits MetaMask's theme. Our amber and our mark exist only as an inline SVG `Image` (use `design/kit/favicon.svg`, recolored to the theme's foreground if needed), used once at the top of the panel.
- Show an override timer. MetaMask's Confirm is the override. Do not reimplement one.

## 2. The verdict model

The reader returns one of four verdicts for the address under review. The panel is a direct rendering of the verdict plus the sync state.

| Verdict | Meaning | Banner | When |
| --- | --- | --- | --- |
| `block` | Flagged in a blocking category by enough independent writers on the user's lists | `danger` | Drainer receiver, drainer spender, malicious delegate, malicious token, paid lookalike, poisoning operator |
| `warn` | Flagged, but policy says warn only | `warning` | Poisoning funder, theft proceeds, or a single writer where the policy wants two |
| `clean` | Synced and verified, and no flag matched | `success` | The normal case |
| `unavailable` | The reader could not reach a verified state | `info` (never success, never "clean") | First run, sync in progress, RPC unreachable, replay mismatch |

"Clean" is never the word on screen. The word is "No flags." A green banner means "we checked and found nothing," not "this address is safe." The subtitle under it says what was checked and when, so the user can judge how much that means.

## 3. Transaction insight panel

Appears as the "Tocsin" tab in the confirmation window. MetaMask shows Details, Tocsin, Hex. We cannot make our tab the default. The user clicks it. Keep the panel short enough to read in five seconds, with the verdict first.

### 3.1 What to evaluate

From the transaction object: `to` (always), and for recognised calldata the decoded target:

- ERC-20 `approve(spender, amount)`, `increaseAllowance`: the spender
- ERC-20 `transfer(to, amount)`, `transferFrom(from, to, amount)`: the recipient
- ERC-721 and ERC-1155 `setApprovalForAll(operator, true)`: the operator
- Permit2 `approve` and `permit`: the spender
- EIP-7702 authorization lists, if present on the transaction: each delegate

Evaluate every address found. The panel shows the worst verdict first, then one block per flagged address. If nothing is flagged, show one summary.

### 3.2 BLOCKED, exact content and order

Component tree, top to bottom. Words in quotes are the literal copy.

1. `Box` horizontal: `Image` (the mark, 20 px) and `Heading` "Blocked". Below it, `Text` color `error`: "Reject this transaction."
2. `Banner` severity `danger`, title "Drainer receiver": "This address receives funds forwarded by wallet drainers. Flagged by 2 of 2 lists you follow."
3. `Section` with `Row`s, in this order:
   - `Row` label "address", value `Address` component with the flagged address (jazzicon makes it recognisable against the Details tab).
   - `Row` label "role", value `Text` "recipient" (or "spender", "operator", "delegate", matching where the address was found).
   - `Row` label "category", value `Text` "DRAINER_RECEIVER", with a `Tooltip` on the row giving the plain-language definition from the spec's category table.
   - `Row` label "flagged by", value: one `Text` per writer, the writer's ENS name, with `Text` color `muted` after it naming the list that carries it. Example lines: "seal.tocsin.eth · via seal list", "scamsniffer.tocsin.eth · via scamsniffer list". If two writers are on the same list, both still appear.
   - `Row` label "evidence", value `Link` to the evidence transaction on the chain's explorer, text being the truncated hash, followed by `Copyable` with the full hash. One per writer if they differ.
   - `Row` label "seen", value `Text` "block 23,410,118 · 14 days ago" from the leaf's `seenBlock`.
4. `Divider`.
5. Sync state, three `Row`s with `Text` color `muted`:
   - "synced": "41,207 flags · 2 writers · 4 min ago"
   - "proven": "head 0x9c4e…a1f0 at block 11,482,207"
   - "source": "header and proof from rpc.sepolia.org · best effort, not a light client"
   The last line is mandatory in every state. It is the honesty line that keeps the Kohaku comparison truthful.
6. `Text` color `muted`, small: "Checked on this device. Nothing was sent to anyone."

No buttons. MetaMask's Reject button is the action, and the panel told the user to press it.

### 3.3 WARN

Same as Blocked with these differences:

1. `Heading` "Warning". `Text` color `warning`: "Check this address before you continue."
2. `Banner` severity `warning`, title from the category, body says why it is a warning and not a block: "Flagged by 1 of 2 lists you follow. Your policy blocks only on two independent writers." or "Theft proceeds are a warning by policy; this category is meant for exchanges and bridges, not send screens."
3. Rows identical.

### 3.4 NO FLAGS

1. `Box` horizontal: `Image` (mark) and `Heading` "No flags".
2. `Banner` severity `success`, title "Not on any list you follow": "Checked against 2 lists, 41,207 flags, synced 4 min ago."
3. `Section`:
   - `Row` "checked": `Text` "recipient 0x8c1D…4e9a" (and any spender or delegate also checked, one per line).
   - `Row` "lists": `Text` "seal, scamsniffer".
4. `Divider`, then the same three sync rows as 3.2 step 5, then the "Checked on this device" line.

Keep this panel short. It exists so the user sees the Snap is working and sees the honesty line. If the SDK's `IconName` enum has a shield or security-check icon, put it beside the heading; otherwise use the mark alone. Do not draw a custom green shield as an SVG; it reads as a third-party badge.

### 3.5 UNVERIFIABLE

This is the state the lying-RPC demo lands on. It must look different from both red and green.

1. `Heading` "Unverifiable". `Text` color `warning`: "Tocsin could not verify the flag log. Treat this address as unchecked."
2. `Banner` severity `info`, title depends on cause:
   - Replay mismatch: title "The RPC's data does not match Ethereum", body "Replayed 41,206 flags from rpc.evil.example and the chain did not reach the head proven at block 11,482,207. One or more flags are missing or altered. Switch RPC in Tocsin settings."
   - Unreachable: title "Could not reach rpc.sepolia.org", body "Last good sync 2 h ago at head 0x9c4e…a1f0."
   - First run: title "First sync in progress", body "Downloading flags for 2 lists. Usually under a minute."
3. Sync rows as in 3.2 step 5, with "synced" showing the last good state and its age, or "never".
4. `Button` "Retry sync" (interactive, calls the sync, redraws with `snap_updateInterface`, shows `Spinner` while running).

Never render the success banner in this state, even if the last cached verdict for the address was clean.

### 3.6 SYNCING (overlay on any state)

If a sync is running when the panel opens, show the cached verdict and append a `Row` "sync": `Spinner` plus `Text` "updating…". Replace it with the fresh result via `snap_updateInterface` when the sync finishes. Do not block the panel on the sync.

## 4. Signature insight panel

`onSignature` fires for `personal_sign` and `eth_signTypedData_v4`. The content shows only when `severity` is `Critical`, so this panel exists only for a flagged spender. Decode EIP-2612 `Permit` and Permit2 `PermitSingle` and `PermitBatch` typed data; evaluate the `spender`. If `block` or `warn`, return `severity: Critical` and the Blocked panel from 3.2 with role "spender" and the heading line "Reject this signature." If clean or unavailable, return no content; MetaMask shows nothing, and that is the documented behaviour, not a bug.

## 5. Home page, which is the settings page

Reached from MetaMask menu, Snaps, Tocsin. Built with interactive UI: the page is created with `snap_createInterface`, every control reports through `onUserInput`, and the page redraws with `snap_updateInterface`. Store the interface id in state so a cronjob can refresh the status section.

Sections, top to bottom:

### 5.1 Status

- `Heading` "Tocsin".
- `Row` "flags": "41,207 across 2 writers"
- `Row` "proven head": "0x9c4e…a1f0 · seq 41,207 · block 11,482,207"
- `Row` "last sync": "4 min ago"
- `Row` "source": "rpc.sepolia.org · best effort, not a light client"
- `Button` "Sync now".

### 5.2 Lists

One `Card` per pinned list, each with:

- Title: the list's ENS name, for example `seal.tocsin.eth`.
- Description: "maintainer 0xD8Ac…81ec · 1 writer · version 3 · updated 2 days ago".
- `Checkbox` "Follow this list" (unchecking keeps the list pinned but excludes it from evaluation; the writer's flags stay synced so re-enabling is instant).
- `Button` variant `destructive` "Remove".

Below the cards, a `Form` with `Field` "Add a list by ENS name", `Input` placeholder "name.tocsin.eth", and `Button` "Add". On submit: resolve the name through the configured RPC, read the list root and maintainer signature, verify the signature, then `snap_dialog` confirmation showing the maintainer address and writer count before pinning. If the resolved maintainer of an already-pinned list changes between syncs, the sync marks that list "maintainer changed" and the card shows a `Banner` severity `warning` with a `Button` "Review" that opens the same dialog. The list stays excluded until the user accepts.

### 5.3 Policy

- `Dropdown` "Block when flagged by": options "1 writer", "2 independent writers" (default 2).
- `Checkbox` per warn-only category, defaulting to the spec's recommendation: `POISONING_FUNDER` warn, `THEFT_PROCEEDS` warn, everything else block.
- `Checkbox` "Also check approvals, permits and 7702 delegates" (default on).

### 5.4 Network

- `RadioGroup` "Read Ethereum through": "MetaMask's network" (uses `endowment:ethereum-provider`, so the data comes from whatever RPC the user has set in MetaMask) or "Custom RPC".
- `Field` "RPC URL", `Input`, shown when Custom is selected. Default `https://rpc.sepolia.org`.
- `Text` color `muted`: "This Snap cannot run a light client or route through anon-rpc. The RPC you pick here can see which flags you download, never which address you check. Use Kohaku for full verification."

### 5.5 About

- `Text`: "Tocsin is an open, append-only log of scam infrastructure on Ethereum. Flags come from writers on lists you choose. Nothing is ever removed."
- `Link` "Read the spec" to the spec, `Link` "Source" to the repo. Version string.

## 6. Install

`onInstall` runs the first sync against the default lists and default RPC, then opens one `snap_dialog` (type alert): heading "Tocsin is on", body "Every transaction and permit is now checked against 2 lists, 41,207 flags, on this device. Open Tocsin from the Snaps menu to change lists or the RPC." If the first sync fails, the body says "First sync failed: could not reach rpc.sepolia.org. Tocsin will retry in the background and show 'unverifiable' until then."

## 7. State kept in `snap_manageState`

- `lists[]`: name, maintainer, root, version, signature, entries, followed flag, maintainerChanged flag.
- `writers{}` keyed by address: provenHead, provenSeq, provenBlock, leaves since anchor (or the evaluated map derived from them), lastSyncAt.
- `policy`: threshold, warnCategories, checkApprovals.
- `network`: mode, rpcUrl.
- `lastGood`: head, seq, block, at. Shown in unverifiable states.
- `homeInterfaceId` for live updates.

Nothing about evaluated addresses is ever written. No history, no counters, no telemetry. The privacy line on every panel has to be literally true.

## 8. Copy rules

- Red appears only on a Blocked verdict. Warning is amber via MetaMask's `warning` color. Green appears only on "No flags" and only with the "checked against N lists, synced X ago" subtitle.
- Never "safe," never "clean," never "verified" in the Snap. The Snap verifies replay against an RPC-served header, and the honesty line says so. "No flags" and "proven head" are the strongest words allowed.
- Writers are always shown by ENS name, never by address alone. The list that carries each writer is named, so "2 of 2 lists" is explainable at a glance.
- Every panel ends with "Checked on this device. Nothing was sent to anyone."
- Category names stay in their spec form (`DRAINER_RECEIVER`) as the row value, with the plain-language meaning in the banner title and tooltip.

## 9. Demo beats this UI must carry

1. Honest RPC: paste the drainer receiver, open the Tocsin tab, see Blocked with two writers and the evidence link. Press Reject.
2. Lying RPC: switch Network to the proxy that drops one flag, paste the same address, see Unverifiable with "chain did not reach the head proven at block N." Never green.
3. Mirror: switch back, Retry sync, see Blocked again.
4. Control: the same address in MetaMask without the Snap shows nothing.

## 10. Open questions for the dev

- Confirm which `IconName` values exist in the installed SDK version; pick one for the No flags heading if a shield or check exists.
- Confirm `eth_getProof` is reachable through `endowment:ethereum-provider` on Sepolia in the current MetaMask release. If not, Custom RPC becomes the only mode and the radio group goes away.
- Confirm the interactive `Button` works inside `onTransaction` in production MetaMask, not only Flask, since "Retry sync" depends on it. If not, drop the button and tell the user to open the home page.
