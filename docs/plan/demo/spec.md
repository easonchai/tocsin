# Demo: reader, trust lists, and wallet hosts on Sepolia

Status: ready-for-agent
Created: 2026-11-06
Updated: 2026-11-06, wallet section replaced by the three hosts in `docs/wallet-integrations.md`

## Source documents

- PRD and normative spec: `erc/eip-draft_threat_flag_log.md`, rendered as `site/erc.html` (same document; see the log-contract spec). The reader, the list encoding, the reader policy, and the light-client read procedure are all normative there. Every decision below cites the ERC section it implements. A deviation is a bug in the ERC or the code: flag it, do not diverge silently.
- Settled decisions and build order: `HANDOFF.md`. It wins over ethskill advice.
- Wallet hosts: `docs/wallet-integrations.md`. One reader, three hosts (Kohaku module, MetaMask Snap, provider-proxy extension), with the trust level, scope, acceptance, order, and cut lines for each. It supersedes HANDOFF step 6's standalone screens.
- Companion spec: `docs/plan/log-contract/spec.md`. The demo consumes the contract and the test fixture it produces.

## Problem statement

A wallet user about to send, approve, or delegate has no way to learn that the counterparty is known scam infrastructure without asking a company whose API sees every address the user asks about. A user running a light client still trusts a label server for the one check that prevents the most common losses (ERC, Motivation).

## Solution

A reader library that proves the heads of the writers it trusts, syncs those writers' leaves from any source, rejects any suffix that does not land on the proven head, and evaluates every address on the device. Trust lists signed by a maintainer, located through ENS, pinned on first use. The reader runs inside wallets people already use: a module in Kohaku, the Ethereum Foundation's privacy wallet, which has Helios built in and routes reads through privacy transports, so the RPC cannot lie and does not learn what was checked; a MetaMask Snap, where every evaluation is local but the header comes from an RPC; and a provider-proxy browser extension that wraps any injected wallet. Same reader, same data, different trust level per host, stated plainly in each (ERC, Abstract; Trust lists; Reader policy; Light-client read procedure; `docs/wallet-integrations.md`).

Three demo beats (HANDOFF, build order step 3), run inside Kohaku. Honest RPC: the wallet blocks a send to a flagged drainer receiver and names the writer, the category, and the evidence. Lying log proxy: the wallet says "unverifiable, chain mismatch at sequence N", never "clean". Snapshot mirror: the same entries from another source land on the proven head and the block returns. If Kohaku fell through at hour three, the Snap runs the beats and Kohaku is shown as a diagram. The Snap has one RPC and no snapshot source (`snap-ui.md`), so its third beat is switching back to the honest RPC and pressing Retry sync.

## User stories

### List maintainers

1. As a list maintainer, I want to assemble a trust list of writers with weights, operator and upstream names, block ranges, head pins, category bits, and a snapshot URI per writer, so that readers apply my judgement without the log having any (ERC, Trust lists, `ListEntry`).
2. As a list maintainer, I want to sign the list root with EIP-712 in the log's domain, so that whoever serves the document cannot alter it (ERC, Trust lists, signature bullet).
3. As a list maintainer, I want to publish root, version, signature, and document URI as an ENS text record, so that a wallet finds the current list by name (ERC, Trust lists, publication method (b)).
4. As a list maintainer, I want to publish a new version by bumping the version and re-signing, so that readers pick it up and refuse to go backwards (ERC, Trust lists, reader pinning bullet).
5. As a list maintainer, I want to cut a compromised writer at a block number with one record update, so that every reader applies the cut on its next sync (ERC, Rationale: Block-range and head pins).
6. As a list maintainer, I want writers sharing an operator or upstream to count as one, so that a two-writer threshold cannot be met with two of my keys (ERC, Trust lists, independence bullet; Rationale: Declared independence).
7. As a list maintainer, I want to publish a safelist, so that a framed exchange hot wallet gets at most a warning (ERC, Trust lists, `Safelist`; Reader policy rule 4).
8. As a list maintainer, I want my name mounted as an ENSv2 subregistry with writers as subnames and a permissioned resolver record for the list, so that publishing roles are explicit and verifiable (HANDOFF, ENS prize target).
9. As a list maintainer, I want a command that builds, signs, and emits the record value, so that I never hand-assemble hex.

### Readers (the library)

10. As a reader, I want a verified execution block hash from a consensus light client and a state root from a header I hash myself, so that no RPC can lie about state (ERC, Light-client read procedure, step 1).
11. As a reader, I want one storage proof call covering the head and sequence slots of every writer across all my pinned lists, so that the proof server learns only which default set I run (ERC, step 2).
12. As a reader, I want to sync a writer's leaves from any source, bounded by the proven block and proven sequence, so that a mirror, a snapshot, and a public RPC are interchangeable (ERC, step 3).
13. As a reader, I want to recompute each writer's chain from an anchor and compare to the proven head, so that an omitted or altered leaf shows as a mismatch (ERC, step 4).
14. As a reader, I want a mismatch to rewind to my last finalized checkpoint, retry once, then mark the writer unavailable with the diverging sequence, so that a flaky source does not strand me and a lying one cannot clean me (ERC, step 4).
15. As a reader, I want a checkpoint of block, per-writer sequence, and per-writer head persisted only for finalized blocks, so that a reorg never corrupts my anchor (ERC, step 1).
16. As a reader, I want to start from an untrusted anchor and never replay from a writer's first leaf, so that a fresh install syncs in seconds (ERC, step 3; Rationale: Per-writer proofs and full local sync).
17. As a reader, I want leaves beyond the proven sequence dropped and leaves before the anchor never evaluated, so that unverified data is never used (ERC, steps 3 and 4).
18. As a reader, I want to fetch a list document, hash it, and verify the maintainer's signature, so that a name record only locates the list (ERC, Trust lists, reader verification bullet).
19. As a reader, I want to pin maintainer and highest version on first accept, reject lower versions, and refuse a different maintainer without explicit user confirmation, so that a lapsed name cannot swap my list (ERC, Trust lists, pinning bullet).
20. As a reader, I want an unverifiable record to leave the last verified version in force and shown as stale, so that a gateway outage never clears my protections (ERC, Trust lists, pinning bullet).
21. As a reader, I want the ENS record read through verified state and never through an unverifiable gateway, so that the record is as trustworthy as the log (ERC, Trust lists, root-source bullet).
22. As a reader, I want the recommended policy applied exactly: one listed writer warns, two independent writers block, weight 255 in a blocking list blocks, same-writer tombstones clear, counters reduce the count, disputes change only presentation, safelists cap at warn, escalation is OR across lists (ERC, Reader policy rules 1 to 7).
23. As a reader, I want block-range and head-pin bounds honoured per entry, so that a maintainer's cut applies from the replayed log alone (ERC, Trust lists, `headPin` bullet).
24. As a reader, I want noisy-category leaves ignored unless the entry sets that bit, so that a high-volume writer cannot flood me (ERC, Categories, last bullet).
25. As a reader, I want a `chainId = 0` leaf outside categories 1, 2, 6, and 8 applied only to the log's chain, so that a contract with different code elsewhere is not misjudged (ERC, Leaf, `chainId` bullet).26. As a reader, I want "unavailable" and never "clean" when a pinned writer cannot sync or zero pinned writers resolve, so that an outage reads as uncertainty (ERC, Reader policy rule 8).
27. As a reader, I want evaluation to run on the device against the synced set with no per-subject query to anyone, so that the subject never leaves the device (ERC, Light-client read procedure, closing paragraph).
28. As a reader, I want my own account's code read through verified state and the address after `0xef0100` evaluated as a category 4 subject, so that an installed malicious delegate is caught (ERC, Reader policy rule 9).
29. As a reader integrator, I want one sync call and one evaluate call with the proof source, leaf source, and checkpoint store injected, so that a wallet, a guard, or a test plugs in its own.
30. As a reader integrator, I want the library to document the policy it applies, so that the ERC's documentation requirement is met (ERC, Reader policy, preamble).

### Wallet users, any host

31. As a wallet user, I want a blocked send to name the writer, the category, and the evidence hash with an explorer link, so that I can judge the accusation (ERC, Reader policy rule 1; Security Considerations: Liability).
32. As a wallet user, I want to override a block on the device after a short delay without asking anyone, and never have the override reported, so that a false positive cannot lock me out (ERC, Reader policy rule 2; wallet-integrations, all three hosts).
33. As a wallet user, I want the spender of an approval or permit and the delegate of an EIP-7702 authorization evaluated before I sign, so that approval phishing and malicious delegates are caught (ERC, Categories 4 and 7).
34. As a wallet user, I want the active lists shown with maintainer, version, and fresh or stale, so that I can see whose judgement I trust (ERC, Security Considerations: Sybil lists).
35. As a wallet user, I want a visible "unverifiable" state naming the writer and the sequence where the chain diverged, so that I know the data is tampered rather than the address clean (ERC, Reader policy rule 8).
36. As a wallet user, I want each host to say plainly what it verifies, fully verified in Kohaku and best-effort in MetaMask, so that I am not sold a claim the host cannot keep (wallet-integrations, Snap section).
37. As a wallet user, I want no server of the team's in any path, so that the team disappearing changes nothing (README, CROPS; wallet-integrations, What this does not include).

### Kohaku module users

38. As a Kohaku user, I want the module to sync on every new finalized header from Kohaku's own Helios, so that the chain head I trust is the one my wallet already verifies (ERC, Security Considerations: Light-client assumptions; wallet-integrations, Kohaku).
39. As a Kohaku user, I want the reader's proofs and fetches to go through Kohaku's anonymising transport, so that the RPC never learns my IP or which writers I follow (wallet-integrations, Kohaku, "What it proves").
40. As a Kohaku user, I want the send screen to evaluate the recipient, the signing screen to evaluate the spender, the delegate, and my own account's delegate, and the activity list to evaluate incoming senders and token contracts, so that all three ways I meet an address are covered (wallet-integrations, Kohaku scope).
41. As a Kohaku user, I want a settings page with pinned lists by ENS name, their maintainers, the Helios checkpoint age, and the consensus endpoint, so that I can see and change what I trust (wallet-integrations, Kohaku scope).
42. As a Kohaku user, I want to switch the leaf source between an RPC and each list entry's `snapshotURI`, so that I can route around a lying or dead source (ERC, Trust lists, `snapshotURI` bullet; Security Considerations: Data availability; HANDOFF step 3).
43. As a Kohaku user, I want Ambire itself untouched and the module added on top, so that the integration is a module someone else could maintain (wallet-integrations, Kohaku).

### MetaMask Snap users

44. As a MetaMask user, I want a panel in the confirmation screen for a transaction whose `to`, decoded ERC-20 spender or recipient, Permit2 spender, or `setApprovalForAll` operator is flagged, so that the warning appears before the confirm button (wallet-integrations, Snap scope, `onTransaction`).
45. As a MetaMask user, I want the same panel for an EIP-2612 permit or Permit2 typed-data signature, so that a gasless approval to a drainer is caught (wallet-integrations, Snap scope, `onSignature`).
46. As a MetaMask user, I want the Snap to sync on install and on a timer and keep the evaluated set in Snap state, so that the panel answers without a per-address query (wallet-integrations, Snap scope).
47. As a MetaMask user, I want the RPC the Snap fetches from to be configurable with a public default, so that I can pick who sees my sync traffic (wallet-integrations, Snap scope).
48. As a MetaMask user, I want a changed list maintainer to require my confirmation in a dialog, so that a lapsed name cannot swap my list silently (ERC, Trust lists, pinning bullet; wallet-integrations, Snap scope).

### Provider-proxy extension users

49. As a user of any injected wallet, I want a content script that wraps `window.ethereum` and every EIP-6963 provider at document start and intercepts `eth_sendTransaction`, `eth_signTypedData_v4`, and `wallet_sendCalls`, so that the check runs before my wallet's popup opens (wallet-integrations, extension scope).
50. As a user of any injected wallet, I want an overlay on `block` with the writer, category, evidence, and an override after a delay, an overlay on `warn` that continues on confirm, and a plain statement on `unavailable`, so that each verdict has one behaviour (wallet-integrations, extension scope).
51. As a user of any injected wallet, I want the intercepted request never stored, logged, or transmitted, so that the extension is not another thing that sees my transactions (wallet-integrations, extension scope).

### Writers and operators

52. As an automated detector, I want a script that watches Sepolia for dust transfers, resolves the authorizer rather than the bundler for ERC-4337 operations, and signs a batch of category 1 leaves with its own key, so that the log fills without a human (ERC, Category 1; Security Considerations: Bundlers and relayers are not operators; HANDOFF step 5).
53. As the detector operator, I want the detector key to only sign and a separate relayer key to pay gas, so that neither stolen key gives both forgery and funds (ERC, Rationale: Typed signatures and relayed batches; wallets ethskill).
54. As the detector operator, I want the detector rate-limited, so that an attacker cannot set my gas bill (ERC, Security Considerations: Gas griefing of writers).
55. As a writer, I want to publish a snapshot of my leaves in writer-sequence order as a static file, so that readers can sync after nodes drop history (ERC, Security Considerations: Data availability).
56. As the team, I want about fifty seeded leaves from two writers covering categories 1, 3, 6, 7, and one category 8 leaf, with one tombstone, one counter, and one dispute, so that the demo has every leaf kind to show, including the warn-only category (HANDOFF step 2; ERC, Categories).
57. As the team, I want a lying log proxy that forwards everything except one dropped log entry, so that beat two is reproducible (HANDOFF step 3).
58. As the team, I want the hour-3 Kohaku decision and the hour-6 worker go or no-go both honoured, so that the demo ships either way (wallet-integrations, Order and cut lines; HANDOFF step 1).
59. As the team, I want the README's CROPS section to match what the shipped code does, so that the claims are checkable (README, CROPS; crops ethskill).

### Added for ERC v2.1

60. As a reader at a send screen, I want a category 8 (`THEFT_PROCEEDS`) leaf alone to warn and never block, so that a tracing signal meant for cash-out points does not stop a payment (ERC, Categories, category 8 bullet).
61. As a reader, I want a list entry's `snapshotURI` usable as that writer's leaf source, verified by replay like any other source, so that the maintainer who chose the writer also tells me where its history lives (ERC, Trust lists, `snapshotURI` bullet).

## Implementation decisions

### Packages and chain

- Scaffold with create-eth 2.0.23, Foundry flavour. The Foundry package belongs to the log-contract spec. The scaffold's Next.js package is not the product; it is the hour-0-to-6 harness page for Helios plus Anon-RPC and nothing more. A workspace package `@tocsin/reader` holds the reader library so the three hosts, the detector, and the tests share one implementation (wallet-integrations, One reader; HANDOFF, pinned packages).
- Pinned: viem 2.57.16, wagmi 3.7.11, `@a16z/helios` 0.12.0, `@anon-rpc/browser-harness` 0.4.0, `@ensdomains/ensjs` 5.2.12 using the `wallet/v2` entry. All verified on npm on 2026-11-06 and all are current latest (tools ethskill). For the Snap: `@metamask/snaps-sdk` 12.1.0 and `@metamask/snaps-cli` 8.4.1, current latest on npm on 2026-11-06. The Kohaku fork is `ethereum/kohaku-extension`, whether it builds and runs on Sepolia is checked in hour one. A version that stops resolving is flagged, not substituted silently.
- Sepolia everywhere: scaffold config, Helios network, ENS, detector, each host. No mainnet configuration (user decision, 2026-11-06).

### Reader library

- Pure TypeScript, no DOM or Node assumptions.
- Injected interfaces. Proof source: returns a verified block (number, hash, state root, finalized flag) and storage values for a list of slots proven against that root. Leaf source: returns `Appended` events for one writer from a sequence to a proven block, each with the block number it was appended in, and an anchor head for a sequence. Checkpoint store: key-value get and set. The wallet wires proofs to Helios, leaves to the worker or the mirror, checkpoints to IndexedDB. Tests wire all three to in-memory fakes.
- Block number per event is mandatory in the leaf source and in the mirror format. The leaf hash commits to it (ERC, Leaf hash and chains) and list bounds `fromBlock` and `toBlock` compare on it (ERC, Trust lists), but the `Appended` event does not carry it. An RPC source takes it from the log's receipt; the mirror stores it alongside each event. The log-contract spec flags the ERC's snapshot description for this.
- Sync: prove the union of writers across all pinned lists in one proof request (ERC, step 2); for each writer fetch the suffix from its anchor bounded by proven block and sequence (step 3); recompute and compare (step 4); on mismatch rewind to the last finalized checkpoint and retry once, then mark unavailable with the first diverging sequence; checkpoint only on finalized blocks (step 1).
- Evaluate: takes a subject, a context (recipient, spender, delegate, or incoming sender) and an optional own-account code; returns `clean`, `warn`, `block`, or `unavailable`, plus the leaves, writers, and lists that produced the verdict. `clean` only when every pinned writer synced (ERC, rule 8; wallet-integrations, One reader, item 4). The context selects which categories apply, it does not change the policy, with one exception the ERC states: category 8 alone never raises above `warn` in the recipient context (ERC, Categories, category 8 bullet). Other contexts apply the policy unchanged.
- The host supplies the trusted header and the fetch function. That is the only thing that differs between hosts, and it is what sets each host's trust level (wallet-integrations, One reader, closing paragraph).
- Names for display. `operator` and `upstream` are namehashes, which are one-way, so the list JSON carries an unsigned `labels` map from ENS name to namehash outside the hashed struct. The reader verifies each label by normalising the name per ENSIP-15 and hashing it; a label that does not hash to an entry's value is dropped (ERC, Rationale: Declared independence, "recoverable by hashing candidate names"). The writer address is reverse-resolved through ENS, with the forward record checked through verified state, and the wallet shows the writer's name only when the forward check matches. A writer with no name shows as a shortened address.
- Hashing uses viem's ABI encoding and keccak with the ERC's exact tuple layouts. Parity is pinned by the fixture the log-contract spec's Foundry suite emits.
- Policy defaults to the ERC's recommended policy, and the library's documentation states that. A host may pass `policy` to block on one writer or make categories warn-only (ERC, Reader policy: "A reader MAY implement any policy"); the Snap exposes both on its home page (snap-ui 5.3).
- Slot formulas from the ERC's Storage layout are the only place the reader knows about contract storage.

### Trust lists

- Document wire format is JSON with the `TrustList` and `Safelist` fields as named in the ERC. The root is the keccak of the ABI encoding of the typed struct, never of the JSON bytes, so formatting does not affect the hash (ERC, Trust lists, `listRoot`).
- Signature: EIP-712 over `ListRoot(bytes32 root,uint64 version)` in the log's domain (ERC, Trust lists, signature bullet).
- Publication is method (b): ENS text records `tocsin.list` and `tocsin.safelist` with the hex of `abi.encode(root, version, signature, listURI)`. Method (a), an on-chain list contract, is not built.
- `listURI` points at a static file in the wallet build and at the mirror for the demo. Content addressing is deferred.
- `snapshotURI` (ERC v2.1, Trust lists): each default-list entry carries the URL of that writer's mirror file. The reader builds a leaf source from it when the host's source switch selects the snapshot; the result is verified by replay like any other source. Empty `snapshotURI` means RPC only.
- ENSv2: the team's name mounted as a subregistry, writers as subnames, the record in a permissioned resolver, Enhanced Access Control granting the publish role to the maintainer key. Read through Helios `eth_call` with CCIP-read off (HANDOFF step 4). Fallback if the subregistry is not standing by the end of step 4: a plain text record on the same name read the same way. The maintainer signature carries the trust either way, which is the ERC's point.
- A CLI in the reader package builds, signs, and emits the record value.
- One default list in every host: the team's manual writer at weight 255 in a list the host marks as blocking, and the detector at warn weight in the same list. A second independent maintainer is not on stage; the two-independent-writers path is tested only.
- Reader pinning per the ERC: first accept stores maintainer and version per list name; lower version rejected; different maintainer returns a conflict and the host prompts (a dialog in the Snap, a settings prompt in Kohaku, the overlay in the extension).

### Demo infrastructure

- Seed script: about fifty leaves across the manual writer and the detector, categories 1, 3, 6, 7, plus one category 8 leaf from the manual writer, one tombstone, one counter, one dispute. Manual writer through `append`, detector through `appendSigned` via the relayer. Batches capped at 500 (ERC, Interface, EIP-7825 bullet).
- Lying log proxy: an HTTP JSON-RPC forwarder that passes every method through except `eth_getLogs`, where it drops one `Appended` log of the manual writer.
- Snapshot mirror: a static JSON file per writer of its `Appended` events in writer-sequence order, each record carrying the event's ABI-encoded topics and data plus its block number (ERC, Trust lists, `snapshotURI` bullet; Security Considerations: Data availability, with the block-number wording fix from the log-contract spec), served from the same static host as the list documents. Its URL is the entry's `snapshotURI`.
- Detector: Node script, own key, watches new Sepolia blocks for sub-threshold value transfers to addresses whose prefix and suffix match a recent counterparty of the receiver, resolves the authorizer (UserOperation sender when the target is an EntryPoint), batches category 1 leaves with the dust transaction hash as evidence, signs with a deadline of one hour, hands to the relayer. Fixed leaves-per-hour cap. The relayer drops a batch whose deadline has passed rather than paying for a revert.
- Funding (concepts ethskill, who pays): the manual writer's key, the relayer, and the demo account in Kohaku each need Sepolia ETH from a faucet before step 2. The detector key holds nothing. The runbook lists the three addresses and the faucet used.
- Relayer: Node script, separate funded key, submits `appendSigned`. The detector key never holds ETH.

### Hour 0 to 6 harness: Helios plus Anon-RPC

- A single page in the scaffold's Next.js package, not a product. Helios 0.12.0 in the browser on Sepolia, pinned weak-subjectivity checkpoint, editable consensus endpoint. The Anon-RPC worker bootstrapped through Helios so its hash is light-client verified. A `globalThis.fetch` shim routes Helios's execution RPC URL through the worker. Tor transport by default (`0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e`), Nym fallback (`0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0`). The passthrough specifier is never configured (HANDOFF step 1). Reads slots 2 and 3 of the log and prints the proven values and the transport in use.
- Go or no-go at hour 6. Fallback: Helios direct for proofs, worker for logs, ENS, and broadcast. The host copy then states which reads are anonymised.
- What the harness is for: the bootstrap and shim are the pieces the Kohaku module reuses if Kohaku's own transport is not Anon-RPC, and the pieces the extension's background worker reuses if Kohaku fell through. If Kohaku already runs Helios and Anon-RPC, the harness is only the proof that the worker bootstrap works and is deleted after.

### Host 1: Kohaku module (primary)

- Fork `ethereum/kohaku-extension`. Confirm it builds and runs on Sepolia in hour one. If it does not build by hour three, stop and move to the Snap (wallet-integrations, Kohaku scope). Ambire is not modified; the module is added on top.
- Proof source is Kohaku's Helios header; fetch goes through Kohaku's transport. Whether that transport is Anon-RPC is checked in hour one; if not, the harness bootstrap is wired into the module's background worker so the Anon-RPC judge check still holds.
- Background sync runs the reader on every new finalized header and keeps the evaluated set in extension storage. Checkpoints live there too.
- Three surfaces hooked: send (recipient), signing (spender for approvals and permits, delegate for 7702 authorizations, the account's own delegate), activity list (incoming `tx.from` and token contract).
- Settings page: pinned lists by ENS name with maintainer, Helios checkpoint age, consensus endpoint, leaf source switch between RPC and each entry's `snapshotURI`.
- Verdict panel shows the writer's verified name or shortened address, the operator label, the category name, the evidence, and for `block` the override control after a short local delay. `unavailable` names the writer and sequence. `clean` only when every pinned writer synced. The copy keeps the ERC's framing: the chain proves the flag is the writer's, complete and in order; whether the writer is right is the user's pinned list speaking (ERC, Motivation, "honest, not true").
- Evidence presentation. Evidence is either a transaction hash or the keccak of an off-chain bundle, and nothing in the leaf says which (ERC, Leaf). The panel links the hash to the Sepolia explorer as a transaction; if the lookup fails, it labels it "evidence bundle hash" with a copy control. The lookup is a user-initiated click, never automatic, so no server learns which evidence a user looked at.
- The three beats run here. This is the demo wallet.

### Host 2: MetaMask Snap (second)

- `@metamask/snaps-sdk` 12.1.0, `@metamask/snaps-cli` 8.4.1. Permissions: `endowment:transaction-insight`, `endowment:signature-insight`, `endowment:cronjob`, `endowment:network-access`, `snap_manageState`, `snap_dialog`.
- `onTransaction`: evaluate `to`, and for ERC-20 `approve`, `transfer`, Permit2, and `setApprovalForAll` calldata, the decoded spender, recipient, or operator. `onSignature`: evaluate the spender in EIP-2612 permits and Permit2 typed data.
- Panel: writer name, category, evidence transaction, sync state, and the sentence that verification is best-effort because the header comes from an RPC. Severity drives MetaMask's own warning styling.
- Sync on install and on the cron timer; evaluated set and checkpoints in Snap state. Proof source and leaf source both fetch a user-configurable RPC with a public default. Trusted header is the RPC's latest finalized header, unverified, and the panel says so.
- Lists pinned in Snap state with maintainer; a changed maintainer opens a confirmation dialog.
- Acceptance: install in a clean MetaMask, paste a flagged drainer receiver, see the panel block it before the confirm button; the same address shows clean in MetaMask without the Snap.

### Host 3: provider-proxy extension (third, conditional)

- Built only if Kohaku failed and time remains, or after the hackathon (wallet-integrations, Order and cut lines).
- Manifest V3. Background worker runs the reader and sync; if built because Kohaku failed, it embeds the harness's Helios plus Anon-RPC so the trust level matches Kohaku's. Content script injects the provider proxy at document start, wrapping `window.ethereum` and every EIP-6963 provider.
- Passes everything through except `eth_sendTransaction`, `eth_signTypedData_v4`, `wallet_sendCalls`. Overlay on `block` with override after a delay; overlay on `warn` that continues on confirm; statement on `unavailable` then continue.
- Never stores, logs, or transmits the intercepted request. The overlay is the only output.
- Acceptance: with the extension installed and MetaMask as the wallet, a send to a flagged address is stopped before the MetaMask popup; without it, MetaMask shows nothing.

### Order and cut lines

- Kohaku first, decision at hour three. Snap second. Extension third. If only one ships, ship the Snap and show Kohaku as a diagram (wallet-integrations, Order and cut lines).
- Frontend completeness per the frontend-ux ethskill applies to any surface we draw: the panel, the settings page, the overlay. Address inputs are the host wallet's; we never draw a send form.
- Every ticket under `issues/` carries an `Ethskills:` line naming the AGENTS.md rows it matches, loaded before the ticket starts. Any ticket that draws a surface loads `frontend-ux` and `frontend-playbook`; the pre-demo check loads `qa`; anything touching keys loads `wallets`. HANDOFF wins where they conflict.

### Keys

- Maintainer, detector, and relayer keys are separate and read at run time from an ignored env file or keystore. Nothing signing-capable lands in the repo. A key seen in a chat or a commit is burned and replaced (wallets ethskill).

## Testing decisions

A good test exercises a public entry point and asserts a property the implementation could violate.

The seam is the reader's top-level sync and evaluate calls, through Vitest, with all three injected interfaces faked in memory. Nothing below it is tested.

- Hash parity: load the Foundry fixture from the log-contract spec and assert every leaf hash, writer head, and global head matches the TypeScript recomputation.
- Normative cases 10, 11, and 12 from the ERC's Test Cases, one test each.
- Lying source: the leaf fake drops one leaf, alters one leaf, appends one beyond the proven sequence, and reorders two. Each yields `unavailable` for that writer with the first diverging sequence after one rewind and retry, and never `clean` for any subject of that writer.
- Anchors and checkpoints: first sync from an untrusted anchor lands on the proven head; a second sync starts from the persisted checkpoint and fetches only the suffix; a checkpoint is written only when the proven block is finalized; a mismatch after a checkpoint rewinds to that checkpoint.
- Policy, one test per rule: one listed writer gives `warn`; two independent writers give `block`; two writers sharing an operator give `warn`; two sharing a non-zero upstream give `warn`; weight 255 in a blocking list gives `block` and in a non-blocking list `warn`; a same-writer tombstone clears; a different-writer tombstone is ignored; an independent counter reduces two to one; a dispute does not change the verdict; a safelisted subject caps at `warn`; a noisy category is ignored without its bit and counted with it; `chainId = 0` in category 3 applies only to the log's chain and in category 8 applies everywhere; category 8 from two independent writers gives `warn` in the recipient context and `block` in the incoming-sender context; block range and head pin exclude leaves outside the range; a head pin with no matching head ignores the entry; escalation is OR across two lists.
- Snapshot source: a leaf source built from an entry's `snapshotURI` in the mirror format syncs to the proven head; the same file with one leaf dropped gives `unavailable`.
- Lists: a document whose hash does not match the root is rejected; a bad signature is rejected; a lower version is rejected; a different maintainer returns a conflict and keeps the pinned list; an unverifiable record keeps the last verified version marked stale; zero resolvable writers gives `unavailable`.
- Category 4 self-check: own-account code starting with `0xef0100` followed by a flagged delegate yields the delegate's verdict.

- Context: the same flagged subject evaluated as recipient, spender, delegate, and incoming sender returns the verdict only for the categories that apply to that context, and `clean` otherwise.

Not automated: host surfaces, Helios bootstrap, the Anon-RPC worker, ENS resolution, the detector, the relayer, the proxy, and the mirror. These are covered by a manual checklist run at the two rehearsals. Kohaku: the three beats, both transports, the override, the source switch, a stale list, a different-maintainer prompt, all three surfaces, a fresh-install sync time. Snap: the install, the `onTransaction` block before the confirm button, an `onSignature` permit block, the same address clean without the Snap, the maintainer-change dialog. Extension, if built: the intercept before the MetaMask popup, each of the three verdict behaviours. The whole run on the venue network with a phone hotspot as the fallback, because Tor and Nym may be blocked on conference wifi.

## Success criteria

Done when all of these hold:

- Every test in Testing decisions passes and the parity test loads the Foundry fixture.
- The three beats pass inside Kohaku at a rehearsal on the Tor transport and again on Nym, on the venue network or the hotspot. If Kohaku fell through, the beats pass in the Snap and the submission shows Kohaku as a diagram.
- The Snap's acceptance passes in a clean MetaMask.
- A fresh install of the primary host syncs both default writers and shows a verdict in under thirty seconds.
- The judge checks below are each demonstrable in a host or the repo.

### Judge checks, by prize (HANDOFF, Prize targets)

- Ethereum Foundation, Anon-RPC: in Kohaku the worker is bootstrapped through Helios and its hash is checked against the light client; the transport specifier in use is visible in the settings page; the passthrough specifier is absent from the build; the storage proof request covers only the pinned writers. The Snap does not claim this and its panel says so.
- Ethereum Foundation, CROPS: the README's CROPS section matches the shipped code, no team-run backend exists in any host, the override is local, the lists are pinned by maintainer signature, and the walkaway test holds (delete the team's name and domain, every host keeps working from the pinned list and the log).
- ENS, ENSv2: the team's name is a subregistry, each writer is a subname, the list record sits in a permissioned resolver, Enhanced Access Control grants the publish role, and Kohaku reads the record through Helios `eth_call` with CCIP-read off. If the step-4 fallback triggered, this prize is not claimable and the submission says so.

Prior art: none in the repo. Tests follow the ERC's Light-client read procedure and Reader policy, one test per numbered rule.

## Out of scope

- The contract, its tests, and its deployment. See the log-contract spec.
- Mainnet, real mainnet flags, the Anon-RPC adopters PR (HANDOFF phase 7, deferred by the user).
- The Arkiv mirror.
- A second independent list maintainer on stage.
- A standalone wallet of our own with send, sign, and receive screens. Superseded by the three hosts; the scaffold's Next.js page is only the hour-0-to-6 harness.
- Changes to Ambire or to MetaMask itself (wallet-integrations, What this does not include).
- Private information retrieval, per-subject queries, and an on-chain mirror contract.
- Content-addressed list documents and snapshots.
- Hardware wallet or WalletConnect support beyond what the host wallet already does.
- Chainlink CRE or any hosted automation.
- The backtest, the Ethereum Magicians thread, the ERC PR, and landing page design changes.

## Further notes

- Conflict with HANDOFF: it settled a mainnet deploy and real flags before judging. The user chose Sepolia only on 2026-11-06. CREATE2 with salt zero keeps the address reserved.
- Conflict with the indexing ethskill: it says history must come from an indexer, never from a log scan at request time. The ERC's step 3 allows a bounded `eth_getLogs` per writer from a checkpoint, and HANDOFF settles on syncing only the pinned writers. The checkpoint tail is the incremental read the skill wants, with no hosted indexer, and the mirror is the cold-start path. A hosted indexer would reintroduce a trusted party and is not built.
- The ERC says readers SHOULD fetch list documents and snapshots over the same anonymising transport as RPC. The wallet does, through the worker; if the hour-6 fallback triggers, the wallet copy says which reads are not anonymised.
- Glossary candidates: proof source, leaf source, checkpoint, anchor, verdict (`clean`, `warn`, `block`, `unavailable`), lying proxy, mirror, label. No glossary or ADR exists yet.
- Who pays (concepts ethskill): the reader pays nothing on-chain. The only transactions in this spec are the seed, the detector's relayed batches, and the demo send. Lists are published once by the maintainer. Nothing here needs a scheduled transaction, so nothing stops when the team does, which is the CROPS walkaway answer.
- Verified 2026-11-06: ENSv2, the permissioned resolver, and Enhanced Access Control are deployed on Sepolia, and the Universal Resolver resolves through them. Addresses and sources are in issue 08's Comments. The fallback did not trigger and the ENS prize stays in scope.
- Not verified: whether `ethereum/kohaku-extension` builds, runs on Sepolia, and routes reads through Anon-RPC. All three are hour-one checks (wallet-integrations, Kohaku scope). The Anon-RPC judge check depends on the third; the harness bootstrap is the backup.
- Conflict with HANDOFF step 6: it settles send, sign, and receive screens in a wallet of ours. `docs/wallet-integrations.md`, committed later, replaces that with surfaces inside Kohaku, the Snap, and the extension. This spec follows the later document. HANDOFF step 6's hours now go to the Kohaku surfaces, then the Snap.
- ERC v2.1 (commit 41f3144, merged 2026-11-06) applied on 2026-11-06: category 8 `THEFT_PROCEEDS` with its send-screen cap, `chainId = 0` extended to category 8, `snapshotURI` on `ListEntry`, the honest-not-true framing. The ERC-7730 descriptor it requires is a deployment deliverable in the log-contract spec; no host in this spec signs `Append`, and the detector signs in Node with no device, so the descriptor is not exercised by the demo. EIP-8304 is non-normative and not used.
- Conflict with HANDOFF: its settled decisions still say `chainId = 0` only for categories 1, 2, 6. The ERC adds 8; this spec follows the ERC.
- Build order follows HANDOFF with the wallet-integrations order: Helios and Anon-RPC harness and the Kohaku hour-three decision first, then seed and reader, then proxy and mirror, then ENS, then detector, then Kohaku surfaces and the Snap. Issues go under this directory's `issues/` folder.
