# Wallet integrations: feature request

Tocsin has to be seen running inside wallets people already use, not only in a demo wallet we wrote. This document asks for three integrations that share one reader and differ only in where the reader runs and how much it can verify.

## One reader, three hosts

Build the reader once as a TypeScript package, `@tocsin/reader`, with no UI and no wallet code. It does four things.

1. Takes a set of pinned trust lists, each with its maintainer address, and resolves each list's current root, version, signature, and entries.
2. Given a block header the host trusts, proves `writerHead` and `writerSeq` for every writer the lists name, using `eth_getProof` through a fetch function the host supplies.
3. Fetches those writers' entries since the last anchor from any source the host supplies, replays each chain, and refuses to proceed on a mismatch.
4. Exposes `evaluate(address, context)` returning `clean`, `warn`, `block`, or `unavailable`, with the writer, category, and evidence for anything that is not clean. Context says whether the address is a recipient, a spender, a delegate, or an incoming sender.

The host decides where the header comes from and what transport the fetch uses. That is the only difference between the three integrations, and it is what sets their trust level.

## 1. Kohaku module

Kohaku is the Ethereum Foundation's privacy wallet. It is a fork of Ambire with Helios built in, so it already has a light-client-verified state root and already routes reads through privacy transports. We add a module; we do not modify Ambire and do not maintain a wallet.

What it proves: the full claim. The header comes from Helios, the proof is checked against it, and the fetch goes through whatever anonymising transport Kohaku uses. The RPC cannot lie and does not learn what was checked.

Scope for the hackathon:

- Fork `ethereum/kohaku-extension`, confirm it builds and runs on Sepolia within the first hour. If it does not build by hour three, stop and move on to the Snap.
- Add a background sync that runs the reader on every new finalized header and keeps the evaluated set in extension storage.
- Hook three surfaces: the send screen (recipient), the signing screen (spender for approvals and permits, delegate for 7702 authorizations, and the account's own delegate), and the activity list (incoming `tx.from` and token contract).
- Settings page: pinned lists by ENS name with their maintainer, the Helios checkpoint age, and the consensus endpoint.
- A block is overridable on the device after a delay. Nothing is reported anywhere.

Acceptance: the three-beat demo runs inside Kohaku. Honest RPC blocks the drainer receiver; the lying proxy produces "unverifiable, chain mismatch at sequence N"; the mirror restores the block.

## 2. MetaMask Snap

A Snap runs inside MetaMask with an official hook, `onTransaction` and `onSignature`, that shows a panel in the confirmation screen. Kleros Scout already ships address tags this way, so judges know the shape, and the install moment is the clearest "anyone can use this" we can show.

What it proves: the privacy half and most of the trust half. The reader runs inside the Snap and every evaluation is local, so MetaMask and its RPC never see which address was checked. But a Snap has no light client. The header and the proof come from an RPC the Snap fetches, so verifiability is only as good as that RPC. Say this plainly in the panel and in the pitch: fully verified in Kohaku, best-effort in MetaMask, same reader, same data.

Scope for the hackathon:

- `onTransaction`: evaluate `to`, and for ERC-20 `approve`, `transfer`, Permit2 and `setApprovalForAll` calldata, the decoded spender or recipient.
- `onSignature`: evaluate the spender in EIP-2612 permits and Permit2 typed data.
- Panel content: writer name, category, evidence transaction, and the sync state. Severity drives MetaMask's own warning styling.
- Sync on install and on a timer using `endowment:cronjob`, storing the evaluated set with `snap_manageState`. Fetch through the Snap's own `fetch` against a user-configurable RPC, defaulting to a public one.
- Lists are pinned in Snap state with their maintainer address. A changed maintainer requires the user to confirm in a dialog.

Acceptance: install the Snap in a clean MetaMask, paste a flagged drainer receiver, see the panel block it before the confirm button. Show the same address clean in MetaMask without the Snap.

## 3. Browser extension that wraps any wallet

The Wallet Guard and Pocket Universe model. A content script wraps `window.ethereum` and every provider announced through EIP-6963, intercepts `eth_sendTransaction`, `eth_signTypedData_v4`, and `wallet_sendCalls`, runs the reader, and only then lets the real wallet open. It works with MetaMask, Rabby, Rainbow, and anything else that injects a provider, with no cooperation from the wallet.

Both of those companies shut down in March 2025. The model worked; the companies did not. This one needs no company, because the data is in state and the lists are signed by whoever maintains them.

What it proves: the same as the Snap, with one difference. The extension can embed Helios in its background worker, since extensions have no execution sandbox limits, so it can reach the Kohaku trust level without being a wallet. Do that only if Kohaku itself fell through.

Scope for the hackathon:

- Manifest V3 extension. Background worker runs the reader and the sync. Content script injects the provider proxy at document start so it wraps providers before any page script sees them.
- The proxy passes everything through untouched except the three intercepted methods. On `block`, it shows an overlay with the writer, category, and evidence, and an override after a delay. On `warn`, it shows the overlay and continues on confirm. On `unavailable`, it says so and continues.
- Never store, log, or transmit the intercepted request. The overlay is the only output.

Acceptance: with the extension installed and MetaMask as the wallet, a send to a flagged address is stopped before the MetaMask popup. Without the extension, MetaMask shows nothing.

## Order and cut lines

Kohaku first, because it is the only host that proves the full claim and it is the EF's own wallet. Decide by hour three. The Snap second, because it is a day of work and the install moment is the best "anyone" demo. The extension third, only if Kohaku failed and there is still time, or after the hackathon as the general-purpose distribution.

If only one ships, ship the Snap and show the Kohaku integration as a diagram. A Snap that works in a stranger's MetaMask beats a wallet of ours that works on our laptop.

## What this does not include

No changes to Ambire. No changes to MetaMask itself. No new contracts. No server of ours in any of the three paths.
