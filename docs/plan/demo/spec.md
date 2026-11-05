# Demo: reader, trust lists, and wallet on Sepolia

Status: ready-for-agent
Created: 2026-11-06

## Source documents

- PRD and normative spec: `erc/eip-draft_threat_flag_log.md`, rendered as `site/erc.html` (same document; see the log-contract spec). The reader, the list encoding, the reader policy, and the light-client read procedure are all normative there. Every decision below cites the ERC section it implements. A deviation is a bug in the ERC or the code: flag it, do not diverge silently.
- Settled decisions and build order: `HANDOFF.md`. It wins over ethskill advice.
- Companion spec: `docs/plan/log-contract/spec.md`. The demo consumes the contract and the test fixture it produces.

## Problem statement

A wallet user about to send, approve, or delegate has no way to learn that the counterparty is known scam infrastructure without asking a company whose API sees every address the user asks about. A user running a light client still trusts a label server for the one check that prevents the most common losses (ERC, Motivation).

## Solution

A reader library that proves the heads of the writers it trusts, syncs those writers' leaves from any source, rejects any suffix that does not land on the proven head, and evaluates every address on the device. Trust lists signed by a maintainer, located through ENS, pinned on first use. A demo wallet that runs the reader through a consensus light client and an anonymising RPC worker, so the only thing any server learns is which default lists the wallet ships with (ERC, Abstract; Trust lists; Reader policy; Light-client read procedure).

Three demo beats (HANDOFF, build order step 3). Honest RPC: the wallet blocks a send to a flagged drainer receiver and names the writer, the category, and the evidence. Lying log proxy: the wallet says "unverifiable, chain mismatch at sequence N", never "clean". Snapshot mirror: the same entries from another source land on the proven head and the block returns.

## User stories

### List maintainers

1. As a list maintainer, I want to assemble a trust list of writers with weights, operator and upstream names, block ranges, head pins, and category bits, so that readers apply my judgement without the log having any (ERC, Trust lists, `ListEntry`).
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
25. As a reader, I want a `chainId = 0` leaf outside categories 1, 2, and 6 applied only to the log's chain, so that a contract with different code elsewhere is not misjudged (ERC, Leaf, `chainId` bullet).
26. As a reader, I want "unavailable" and never "clean" when a pinned writer cannot sync or zero pinned writers resolve, so that an outage reads as uncertainty (ERC, Reader policy rule 8).
27. As a reader, I want evaluation to run on the device against the synced set with no per-subject query to anyone, so that the subject never leaves the device (ERC, Light-client read procedure, closing paragraph).
28. As a reader, I want my own account's code read through verified state and the address after `0xef0100` evaluated as a category 4 subject, so that an installed malicious delegate is caught (ERC, Reader policy rule 9).
29. As a reader integrator, I want one sync call and one evaluate call with the proof source, leaf source, and checkpoint store injected, so that a wallet, a guard, or a test plugs in its own.
30. As a reader integrator, I want the library to document the policy it applies, so that the ERC's documentation requirement is met (ERC, Reader policy, preamble).

### Wallet users

31. As a wallet user, I want the wallet to run a consensus light client on Sepolia with a pinned checkpoint I can replace and a consensus endpoint I can change, so that the chain head I trust is signed by the sync committee (ERC, Security Considerations: Light-client assumptions; HANDOFF step 1).
32. As a wallet user, I want execution reads routed through an anonymising worker whose code hash was verified through the light client, so that the RPC never learns my IP or links my reads (HANDOFF step 1).
33. As a wallet user, I want Tor by default and Nym as fallback and never the passthrough transport, so that the privacy claim is true on stage (HANDOFF step 1).
34. As a wallet user, I want to type an address or an ENS name, see the resolved address, and see the verdict before I press send, so that a lookalike is caught before anything leaves the device (frontend-ux ethskill, address inputs).
35. As a wallet user, I want a blocked send to name the writer, the category, and the evidence hash with an explorer link, so that I can judge the accusation (ERC, Reader policy rule 1; Security Considerations: Liability).
36. As a wallet user, I want to override a block on the device after a short delay without asking anyone, and never have the override reported, so that a false positive cannot lock me out (ERC, Reader policy rule 2).
37. As a wallet user, I want the sign screen to evaluate the spender of an approval or permit and the delegate of an EIP-7702 authorization, so that approval phishing and malicious delegates are caught (ERC, Categories 4 and 7; HANDOFF step 6).
38. As a wallet user, I want the receive screen to warn when a recent counterparty is a paid lookalike, so that I do not copy a poisoned address (ERC, Category 6; HANDOFF step 6).
39. As a wallet user, I want the active lists shown with maintainer, version, and fresh or stale, so that I can see whose judgement I trust (ERC, Security Considerations: Sybil lists).
40. As a wallet user, I want a visible "unverifiable" state naming the writer and the sequence where the chain diverged, so that I know the data is tampered rather than the address clean (ERC, Reader policy rule 8).
41. As a wallet user, I want to switch the leaf source between an RPC and a snapshot mirror, so that I can route around a lying or dead source (ERC, Security Considerations: Data availability).
42. As a wallet user, I want every amount with a fiat value or a labelled missing price, so that I understand what I am sending (frontend-ux ethskill).
43. As a wallet user, I want the demo wallet to say it holds a browser-local testnet key, so that I never put real funds in it.
44. As a wallet user, I want the wallet to work from a static build with no backend of the team's, so that the team disappearing changes nothing (README, CROPS; ERC, Rationale: Why a contract and not a transparency log).

### Writers and operators

45. As an automated detector, I want a script that watches Sepolia for dust transfers, resolves the authorizer rather than the bundler for ERC-4337 operations, and signs a batch of category 1 leaves with its own key, so that the log fills without a human (ERC, Category 1; Security Considerations: Bundlers and relayers are not operators; HANDOFF step 5).
46. As the detector operator, I want the detector key to only sign and a separate relayer key to pay gas, so that neither stolen key gives both forgery and funds (ERC, Rationale: Typed signatures and relayed batches; wallets ethskill).
47. As the detector operator, I want the detector rate-limited, so that an attacker cannot set my gas bill (ERC, Security Considerations: Gas griefing of writers).
48. As a writer, I want to publish a snapshot of my leaves in writer-sequence order as a static file, so that readers can sync after nodes drop history (ERC, Security Considerations: Data availability).
49. As the team, I want about fifty seeded leaves from two writers covering categories 1, 3, 6, and 7 with one tombstone, one counter, and one dispute, so that the demo has every leaf kind to show (HANDOFF step 2).
50. As the team, I want a lying log proxy that forwards everything except one dropped log entry, so that beat two is reproducible (HANDOFF step 3).
51. As the team, I want the hour-6 go or no-go on the worker bootstrap honoured, with the fallback being Helios direct for proofs and the worker carrying logs, ENS, and broadcast, so that the demo ships either way (HANDOFF step 1).
52. As the team, I want the README's CROPS section to match what the shipped code does, so that the claims are checkable (README, CROPS; crops ethskill).

## Implementation decisions

### Packages and chain

- Scaffold with create-eth 2.0.23, Foundry flavour. The Foundry package belongs to the log-contract spec. The Next.js package holds the wallet. A third workspace package holds the reader library so the wallet, the detector, and the tests share one implementation (HANDOFF, pinned packages).
- Pinned: viem 2.57.16, wagmi 3.7.11, `@a16z/helios` 0.12.0, `@anon-rpc/browser-harness` 0.4.0, `@ensdomains/ensjs` 5.2.12 using the `wallet/v2` entry. All six verified on npm on 2026-11-06 and all are current latest (tools ethskill). A version that stops resolving is flagged, not substituted silently.
- Sepolia everywhere: scaffold config, Helios network, ENS, detector. No mainnet configuration (user decision, 2026-11-06).

### Reader library

- Pure TypeScript, no DOM or Node assumptions.
- Injected interfaces. Proof source: returns a verified block (number, hash, state root, finalized flag) and storage values for a list of slots proven against that root. Leaf source: returns `Appended` events for one writer from a sequence to a proven block, each with the block number it was appended in, and an anchor head for a sequence. Checkpoint store: key-value get and set. The wallet wires proofs to Helios, leaves to the worker or the mirror, checkpoints to IndexedDB. Tests wire all three to in-memory fakes.
- Block number per event is mandatory in the leaf source and in the mirror format. The leaf hash commits to it (ERC, Leaf hash and chains) and list bounds `fromBlock` and `toBlock` compare on it (ERC, Trust lists), but the `Appended` event does not carry it. An RPC source takes it from the log's receipt; the mirror stores it alongside each event. The log-contract spec flags the ERC's snapshot description for this.
- Sync: prove the union of writers across all pinned lists in one proof request (ERC, step 2); for each writer fetch the suffix from its anchor bounded by proven block and sequence (step 3); recompute and compare (step 4); on mismatch rewind to the last finalized checkpoint and retry once, then mark unavailable with the first diverging sequence; checkpoint only on finalized blocks (step 1).
- Evaluate: takes a subject and an optional own-account code; returns `clean`, `warn`, `block`, or `unavailable`, plus the leaves, writers, and lists that produced the verdict. `clean` only when every pinned writer synced (ERC, rule 8).
- Names for display. `operator` and `upstream` are namehashes, which are one-way, so the list JSON carries an unsigned `labels` map from ENS name to namehash outside the hashed struct. The reader verifies each label by normalising the name per ENSIP-15 and hashing it; a label that does not hash to an entry's value is dropped (ERC, Rationale: Declared independence, "recoverable by hashing candidate names"). The writer address is reverse-resolved through ENS, with the forward record checked through verified state, and the wallet shows the writer's name only when the forward check matches. A writer with no name shows as a shortened address.
- Hashing uses viem's ABI encoding and keccak with the ERC's exact tuple layouts. Parity is pinned by the fixture the log-contract spec's Foundry suite emits.
- Policy is the ERC's recommended policy with no extensions, and the library's documentation states that.
- Slot formulas from the ERC's Storage layout are the only place the reader knows about contract storage.

### Trust lists

- Document wire format is JSON with the `TrustList` and `Safelist` fields as named in the ERC. The root is the keccak of the ABI encoding of the typed struct, never of the JSON bytes, so formatting does not affect the hash (ERC, Trust lists, `listRoot`).
- Signature: EIP-712 over `ListRoot(bytes32 root,uint64 version)` in the log's domain (ERC, Trust lists, signature bullet).
- Publication is method (b): ENS text records `erc-threat-flag-log.list` and `erc-threat-flag-log.safelist` with the hex of `abi.encode(root, version, signature, listURI)`. Method (a), an on-chain list contract, is not built.
- `listURI` points at a static file in the wallet build and at the mirror for the demo. Content addressing is deferred.
- ENSv2: the team's name mounted as a subregistry, writers as subnames, the record in a permissioned resolver, Enhanced Access Control granting the publish role to the maintainer key. Read through Helios `eth_call` with CCIP-read off (HANDOFF step 4). Fallback if the subregistry is not standing by the end of step 4: a plain text record on the same name read the same way. The maintainer signature carries the trust either way, which is the ERC's point.
- A CLI in the reader package builds, signs, and emits the record value.
- Two default lists in the wallet: the team's manual writer at weight 255 in a list the wallet marks as blocking, and the detector at warn weight in the same list. A second independent maintainer is not on stage; the two-independent-writers path is tested only.
- Reader pinning per the ERC: first accept stores maintainer and version per list name; lower version rejected; different maintainer returns a conflict and the wallet prompts.

### Demo infrastructure

- Seed script: about fifty leaves across the manual writer and the detector, categories 1, 3, 6, 7, one tombstone, one counter, one dispute. Manual writer through `append`, detector through `appendSigned` via the relayer. Batches capped at 500 (ERC, Interface, EIP-7825 bullet).
- Lying log proxy: an HTTP JSON-RPC forwarder that passes every method through except `eth_getLogs`, where it drops one `Appended` log of the manual writer.
- Snapshot mirror: a static JSON file per writer of its `Appended` events in writer-sequence order (ERC, Security Considerations: Data availability), served from the wallet's static host.
- Detector: Node script, own key, watches new Sepolia blocks for sub-threshold value transfers to addresses whose prefix and suffix match a recent counterparty of the receiver, resolves the authorizer (UserOperation sender when the target is an EntryPoint), batches category 1 leaves with the dust transaction hash as evidence, signs with a deadline of one hour, hands to the relayer. Fixed leaves-per-hour cap. The relayer drops a batch whose deadline has passed rather than paying for a revert.
- Funding (concepts ethskill, who pays): the manual writer's key, the relayer, and the demo burner each need Sepolia ETH from a faucet before step 2. The detector key holds nothing. The runbook lists the three addresses and the faucet used.
- Relayer: Node script, separate funded key, submits `appendSigned`. The detector key never holds ETH.

### Wallet

- Next.js static export, no server routes, no analytics, no external requests beyond the consensus endpoint, the Anon-RPC transport, and the leaf source.
- Helios in the browser on Sepolia, pinned weak-subjectivity checkpoint, user-editable consensus endpoint. The Anon-RPC worker bootstrapped through Helios so its hash is light-client verified. A `globalThis.fetch` shim routes Helios's execution RPC URL through the worker. Tor transport by default (`0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e`), Nym fallback (`0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0`). The passthrough specifier is never configured (HANDOFF step 1).
- Go or no-go at hour 6. Fallback: Helios direct for proofs, worker for logs, ENS, and broadcast. The wallet copy then states which reads are anonymised.
- Account: browser-local burner key for Sepolia, labelled as a demo wallet with testnet funds only. No team key in the build.
- Screens: send, sign, receive, lists (HANDOFF step 6). Verdict panel shows the writer's verified name or shortened address, the operator label, the category name, the evidence, and for `block` the override control after a short local delay. `unavailable` names the writer and sequence. `clean` only when every pinned writer synced.
- Evidence presentation. Evidence is either a transaction hash or the keccak of an off-chain bundle, and nothing in the leaf says which (ERC, Leaf). The wallet links the hash to the Sepolia explorer as a transaction; if the explorer lookup fails, the panel labels it "evidence bundle hash" with a copy control. The lookup is a user-initiated click, never automatic, so no server learns which evidence a user looked at.
- Frontend completeness per the frontend-ux ethskill: product identity replaced, address inputs resolve names and explain rejections, fiat on every amount, Sepolia as target, one pending state per button, errors translated near the action.

### Keys

- Maintainer, detector, and relayer keys are separate and read at run time from an ignored env file or keystore. Nothing signing-capable lands in the repo. A key seen in a chat or a commit is burned and replaced (wallets ethskill).

## Testing decisions

A good test exercises a public entry point and asserts a property the implementation could violate.

The seam is the reader's top-level sync and evaluate calls, through Vitest, with all three injected interfaces faked in memory. Nothing below it is tested.

- Hash parity: load the Foundry fixture from the log-contract spec and assert every leaf hash, writer head, and global head matches the TypeScript recomputation.
- Normative cases 10, 11, and 12 from the ERC's Test Cases, one test each.
- Lying source: the leaf fake drops one leaf, alters one leaf, appends one beyond the proven sequence, and reorders two. Each yields `unavailable` for that writer with the first diverging sequence after one rewind and retry, and never `clean` for any subject of that writer.
- Anchors and checkpoints: first sync from an untrusted anchor lands on the proven head; a second sync starts from the persisted checkpoint and fetches only the suffix; a checkpoint is written only when the proven block is finalized; a mismatch after a checkpoint rewinds to that checkpoint.
- Policy, one test per rule: one listed writer gives `warn`; two independent writers give `block`; two writers sharing an operator give `warn`; two sharing a non-zero upstream give `warn`; weight 255 in a blocking list gives `block` and in a non-blocking list `warn`; a same-writer tombstone clears; a different-writer tombstone is ignored; an independent counter reduces two to one; a dispute does not change the verdict; a safelisted subject caps at `warn`; a noisy category is ignored without its bit and counted with it; `chainId = 0` in category 3 applies only to the log's chain; block range and head pin exclude leaves outside the range; a head pin with no matching head ignores the entry; escalation is OR across two lists.
- Lists: a document whose hash does not match the root is rejected; a bad signature is rejected; a lower version is rejected; a different maintainer returns a conflict and keeps the pinned list; an unverifiable record keeps the last verified version marked stale; zero resolvable writers gives `unavailable`.
- Category 4 self-check: own-account code starting with `0xef0100` followed by a flagged delegate yields the delegate's verdict.

Not automated: wallet screens, Helios bootstrap, the Anon-RPC worker, ENS resolution, the detector, the relayer, the proxy, and the mirror. These are covered by a manual checklist run at the two rehearsals: the three beats, both transports, the override, the source switch, a stale list, a different-maintainer prompt, a fresh-install sync time, and the whole run on the venue network with a phone hotspot as the fallback, because Tor and Nym may be blocked on conference wifi.

## Success criteria

Done when all of these hold:

- Every test in Testing decisions passes and the parity test loads the Foundry fixture.
- The three beats pass at a rehearsal on the Tor transport and again on Nym, on the venue network or the hotspot.
- A fresh browser profile syncs both default writers and shows a verdict in under thirty seconds.
- The judge checks below are each demonstrable in the wallet or the repo.

### Judge checks, by prize (HANDOFF, Prize targets)

- Ethereum Foundation, Anon-RPC: the worker is bootstrapped through Helios and its hash is checked against the light client; the transport specifier in use is visible in the wallet; the passthrough specifier is absent from the build; the storage proof request covers only the pinned writers.
- Ethereum Foundation, CROPS: the README's CROPS section matches the shipped code, no team-run backend exists, the override is local, the lists are pinned by maintainer signature, and the walkaway test holds (delete the team's name and domain, the wallet keeps working from the pinned list and the log).
- ENS, ENSv2: the team's name is a subregistry, each writer is a subname, the list record sits in a permissioned resolver, Enhanced Access Control grants the publish role, and the wallet reads the record through Helios `eth_call` with CCIP-read off. If the step-4 fallback triggered, this prize is not claimable and the submission says so.

Prior art: none in the repo. Tests follow the ERC's Light-client read procedure and Reader policy, one test per numbered rule.

## Out of scope

- The contract, its tests, and its deployment. See the log-contract spec.
- Mainnet, real mainnet flags, the Anon-RPC adopters PR (HANDOFF phase 7, deferred by the user).
- The Arkiv mirror.
- A second independent list maintainer on stage.
- Private information retrieval, per-subject queries, and an on-chain mirror contract.
- Content-addressed list documents and snapshots.
- Hardware wallet or WalletConnect support.
- Chainlink CRE or any hosted automation.
- The backtest, the Ethereum Magicians thread, the ERC PR, and landing page design changes.

## Further notes

- Conflict with HANDOFF: it settled a mainnet deploy and real flags before judging. The user chose Sepolia only on 2026-11-06. CREATE2 with salt zero keeps the address reserved.
- Conflict with the indexing ethskill: it says history must come from an indexer, never from a log scan at request time. The ERC's step 3 allows a bounded `eth_getLogs` per writer from a checkpoint, and HANDOFF settles on syncing only the pinned writers. The checkpoint tail is the incremental read the skill wants, with no hosted indexer, and the mirror is the cold-start path. A hosted indexer would reintroduce a trusted party and is not built.
- The ERC says readers SHOULD fetch list documents and snapshots over the same anonymising transport as RPC. The wallet does, through the worker; if the hour-6 fallback triggers, the wallet copy says which reads are not anonymised.
- Glossary candidates: proof source, leaf source, checkpoint, anchor, verdict (`clean`, `warn`, `block`, `unavailable`), lying proxy, mirror, label. No glossary or ADR exists yet.
- Who pays (concepts ethskill): the reader pays nothing on-chain. The only transactions in this spec are the seed, the detector's relayed batches, and the demo send. Lists are published once by the maintainer. Nothing here needs a scheduled transaction, so nothing stops when the team does, which is the CROPS walkaway answer.
- Not verified: whether ENSv2, the permissioned resolver, and Enhanced Access Control are deployed on Sepolia today. Check at the start of step 4; if not, the fallback above is the plan and the ENS prize is dropped.
- Build order follows HANDOFF: Helios and Anon-RPC first, then seed and reader, then proxy and mirror, then ENS, then detector, then wallet screens. Issues go under this directory's `issues/` folder, one per phase.
