# Antibody: log, reader, lists, and demo wallet on Sepolia

Status: ready-for-agent
Created: 2026-11-06
Source of truth: `erc/eip-draft_threat_flag_log.md` (ERC v2) and `HANDOFF.md`. Where this spec and the ERC disagree, the ERC wins for anything normative. Where this spec and HANDOFF disagree, see Further notes.

## Problem statement

A wallet user about to send, approve, or delegate has no way to learn that the counterparty is known scam infrastructure without asking a company. The company's list is private, served from an API, and the API sees every address the user asks about. A user running a light client still has to trust a label server for the one check that prevents the most common losses: address poisoning, approval phishing, and drainer sweeps.

Security teams and detectors who already know these addresses have no shared place to publish them that a wallet can verify, that nobody can edit after the fact, and that does not hand the publisher a list of everyone's counterparties.

## Solution

Ship the ERC end to end on Sepolia. A singleton append-only log contract where any writer records flags under its own namespace. A reader library that proves the heads of the writers it trusts, syncs those writers' leaves from any source, rejects data that does not land on the proven head, and evaluates every address on the device. Trust lists signed by a maintainer and located through ENS, pinned on first use. A demo wallet that runs the reader through a consensus light client and an anonymising RPC worker, so the only thing any server learns is which default lists the wallet ships with.

The demo has three beats. An honest RPC: the wallet blocks a send to a flagged drainer receiver and names the writer, the category, and the evidence. A lying log proxy: the wallet says "unverifiable, chain mismatch at sequence N" instead of "clean". A snapshot mirror: the same entries from a different source land on the proven head and the block returns.

## User stories

### Writers

1. As a security team, I want to append flags under my own address by sending a transaction, so that no committee has to admit me before I can publish.
2. As a security team, I want to append a batch of leaves in one transaction, so that a flag costs about ten thousand gas instead of fifty thousand.
3. As a security team with a cold key, I want to sign a batch with EIP-712 and let a relayer submit it, so that my signing key never holds gas.
4. As a security team that signs from a Safe, I want the log to accept an ERC-1271 signature from my contract account, so that a multisig can be the writer.
5. As a writer, I want every leaf to carry a category, an evidence hash, and an observed block, so that a reader can show a user why, not just that.
6. As a writer, I want to append a tombstone referencing my own earlier leaf, so that I can retract a mistake without anyone deleting history.
7. As a writer, I want to append a counter referencing another writer's leaf, so that I can record disagreement on the record.
8. As a flagged party, I want to append a dispute under my own address, so that readers can see I objected.
9. As a writer, I want the log to reject a leaf with an unknown operation, a flag with zero evidence, or a dispute whose subject is not me, so that malformed leaves never enter my chain.
10. As a writer, I want the log to reject an empty batch, so that a no-op transaction cannot advance a nonce or waste a slot.
11. As a writer, I want my signed batch bound to the log's chain and address, a deadline, and my current nonce, so that nobody can replay it elsewhere or later.
12. As a writer, I want the signing domain to recompute after a chain split, so that a signature from one side cannot be replayed on the other.
13. As an automated detector, I want a script that watches Sepolia for dust transfers, resolves the authorizer rather than the bundler for ERC-4337 operations, and signs a batch of category 1 leaves with its own key, so that the log fills without a human in the loop.
14. As the detector operator, I want the detector key to only ever sign and a separate relayer key to pay gas, so that a stolen detector key cannot drain gas funds and a stolen relayer key cannot forge flags.
15. As a writer, I want to publish a snapshot of my own leaves in writer-sequence order, so that readers can sync from me after nodes drop history.

### List maintainers

16. As a list maintainer, I want to assemble a trust list of writers with weights, operator and upstream names, block ranges, head pins, and category bits, so that a reader can apply my judgement without trusting the log to have any.
17. As a list maintainer, I want to sign the list root with EIP-712 in the log's domain, so that whoever serves the document cannot alter it.
18. As a list maintainer, I want to publish the root, version, signature, and document URI as an ENS text record, so that a wallet can find the current list by name.
19. As a list maintainer, I want to publish a new version by bumping the version number and re-signing, so that readers pick it up on their next sync and refuse to go backwards.
20. As a list maintainer, I want to cut a compromised writer at a block number with one record update, so that every reader applies the cut on its next sync.
21. As a list maintainer, I want to mark a writer at weight 255 in a list a reader treats as blocking, so that a single trusted writer can block.
22. As a list maintainer, I want writers under the same operator or upstream to count as one, so that a two-writer threshold cannot be met with two of my own keys.
23. As a list maintainer, I want to publish a safelist of addresses that are never blocked, so that an exchange hot wallet framed by forged evidence gets at most a warning.
24. As a list maintainer, I want the ENS name to be mounted as an ENSv2 subregistry with writers as subnames and a permissioned resolver record for the list, so that publishing roles are explicit and the record is readable through verified state.

### Readers (the library)

25. As a reader, I want to obtain a verified execution block hash from a consensus light client and derive the state root from a header I hash myself, so that no RPC can lie to me about state.
26. As a reader, I want one storage proof call covering the head and sequence slots of every writer in my pinned lists, so that the proof server learns only which default set I run.
27. As a reader, I want to sync a writer's leaves from any source, bounded by the proven block and the proven sequence, so that a mirror, a snapshot, or a public RPC are interchangeable.
28. As a reader, I want to recompute each writer's chain forward from an anchor and compare it to the proven head, so that an omitted or altered leaf shows up as a mismatch.
29. As a reader, I want a mismatch to rewind to my last finalized checkpoint and retry once, then mark the writer unavailable, so that a flaky source does not strand me and a lying source cannot clean me.
30. As a reader, I want to persist a checkpoint of block, per-writer sequence, and per-writer head only for finalized blocks, so that a reorg never corrupts my anchor.
31. As a reader, I want to start from an anchor supplied by an untrusted source and never replay from a writer's first leaf, so that a fresh install syncs in seconds.
32. As a reader, I want to drop leaves beyond the proven sequence and never evaluate leaves before the anchor, so that unverified data is never used.
33. As a reader, I want to fetch a list document, hash it, and check the maintainer's signature, so that a name record only locates the list and cannot replace it.
34. As a reader, I want to pin the maintainer and highest version on first accept, reject lower versions, and refuse a different maintainer without explicit user confirmation, so that a lapsed or re-registered name cannot swap my list.
35. As a reader, I want a list record I cannot verify to leave the last verified version in force and be shown as stale, so that a gateway outage never clears my protections.
36. As a reader, I want to resolve the ENS record through verified state rather than a CCIP-read gateway, so that the record is as trustworthy as the log.
37. As a reader, I want to apply the recommended policy: one listed writer warns, two independent listed writers block, one writer at weight 255 in a blocking list blocks, tombstones clear, counters reduce the count, disputes change only presentation, safelists cap at warn.
38. As a reader, I want to honour block-range and head-pin bounds per list entry, so that a maintainer's cut applies from the replayed log alone.
39. As a reader, I want leaves in noisy categories ignored unless the entry sets that category's bit, so that a high-volume writer cannot flood me.
40. As a reader, I want a `chainId = 0` leaf outside categories 1, 2, and 6 to apply only to the log's chain, so that a contract address with different code elsewhere is not misjudged.
41. As a reader, I want "unavailable" and never "clean" when a pinned writer cannot be synced, and when zero pinned writers resolve, so that an outage reads as uncertainty.
42. As a reader, I want evaluation to run entirely on the device against the synced set, so that no server is ever asked about a single subject.
43. As a reader, I want to read my own account's code through verified state and evaluate the address after an `0xef0100` designator as a category 4 subject, so that a malicious delegate already installed on my account is caught.
44. As a reader integrator, I want the library to expose one call that syncs and one that evaluates a subject, and to take the proof source and leaf source as injected interfaces, so that a wallet, a guard, or a test can plug in their own.

### Wallet users

45. As a wallet user, I want the wallet to start a consensus light client on Sepolia with a pinned checkpoint I can replace, so that the chain head I trust is signed by the sync committee and not asserted by a server.
46. As a wallet user, I want the wallet's execution reads to go through an anonymising worker whose code hash was verified through the light client, so that the RPC never learns my IP or links my reads.
47. As a wallet user, I want the worker to use Tor by default and Nym as a fallback, and never the passthrough transport, so that the privacy claim is true on stage.
48. As a wallet user, I want to type a recipient as an address or an ENS name, see the resolved address, and see the verdict before I press send, so that a lookalike is caught before the transaction leaves the device.
49. As a wallet user, I want a blocked send to name the writer, the category, and the evidence hash with a link, so that I can judge the accusation myself.
50. As a wallet user, I want to override a block on the device after a short delay without asking anyone, so that a false positive cannot lock me out of my own funds.
51. As a wallet user, I want the override never reported to anyone, so that overriding is as private as not overriding.
52. As a wallet user, I want the sign screen to evaluate the spender of an approval or permit and the delegate of an EIP-7702 authorization, so that approval phishing and malicious delegates are caught too.
53. As a wallet user, I want the receive screen to warn when a recent counterparty in my history is a paid lookalike, so that I do not copy a poisoned address.
54. As a wallet user, I want the active lists shown with maintainer, version, and freshness, so that I can see whose judgement I am trusting.
55. As a wallet user, I want a visible "unverifiable" state when the log source disagrees with the proven head, so that I know the data is tampered rather than the address is clean.
56. As a wallet user, I want to switch the leaf source between an RPC and a snapshot mirror, so that I can route around a lying or dead source.
57. As a wallet user, I want every amount shown with a fiat value or a clearly labelled missing price, so that I understand what I am sending.
58. As a wallet user, I want the demo wallet to tell me it holds a browser-local testnet key, so that I never put real funds in it.
59. As a wallet user, I want the wallet to work from a static build with no backend of the team's, so that the team disappearing changes nothing.

### Operators, judges, and the team

60. As the team, I want the log deployed on Sepolia through the deterministic deployment proxy with salt zero, so that the mainnet address will match when we deploy there later.
61. As the team, I want the deployed contract verified on Sourcify and Etherscan, so that judges and integrators see source, not bytecode.
62. As the team, I want about fifty seeded entries from at least two writers on Sepolia, so that the demo has independent writers, a tombstone, a counter, and a dispute to show.
63. As the team, I want a lying log proxy that forwards everything except one altered or dropped log entry, so that beat two of the demo is reproducible.
64. As the team, I want a snapshot mirror served as a static file, so that beat three of the demo is reproducible and the data-availability story is shown.
65. As the team, I want a README transition table and an executable deploy runbook with environment variables and a post-deploy check, so that anyone can redeploy from the repo alone.
66. As a judge, I want the CROPS record in the README to match what the code does, so that the claims are checkable.
67. As the team, I want every key read from an ignored env file or a keystore and never from source, so that nothing in the repo is burned on push.

## Implementation decisions

### Monorepo shape

- Scaffold with create-eth 2.0.23 using the Foundry flavour. Foundry package holds the contract, tests, and deploy script. Next.js package holds the wallet. A third workspace package holds the reader library so the wallet, the detector, and the tests share one implementation.
- Pinned packages from HANDOFF: viem 2.57.16, wagmi 3.7.11, forge 1.9.0 or newer, `@a16z/helios` 0.12.0, `@anon-rpc/browser-harness` 0.4.0, `@ensdomains/ensjs` 5.2.12 (`wallet/v2` entry).
- Target chain is Sepolia everywhere: scaffold config, deploy script, Helios network, detector. No mainnet config in this spec.

### Log contract

- The contract is the ERC's reference implementation, extracted verbatim. No OpenZeppelin dependency, no changes to the hashing, the storage order, or the signature verification. Reason: the ERC's normative storage layout and the nine passing tests are tied to this exact source, and the ERC must stay CC0 and dependency-free.
- Storage slot order is normative: global head, global sequence, writer head mapping, writer sequence mapping, signature nonce mapping. Any added state goes after slot 4 and nothing gets added in this spec.
- Deployment through the deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt zero, init code equal to the compiled reference contract with no constructor arguments. The deploy script computes and prints the expected address before broadcasting and refuses to broadcast if code already exists there.
- Verification runs in the same step as the deploy: Sourcify first, Etherscan second.
- Transition table for the README: `append`, caller is the writer, pays because listing is distribution, if nobody calls nothing changes. `appendSigned`, caller is any relayer, pays because the writer sponsors it or the relayer is the writer's own, if nobody calls the signed batch expires at its deadline.

### Reader library

- One TypeScript package, pure, no DOM or Node assumptions, so it runs in the wallet, in the detector's self-check, and in Vitest.
- Two injected interfaces. A proof source returns a verified block (number, hash, state root) and storage values for a list of slots proven against that root. A leaf source returns `Appended` events for one writer between a from-sequence and a proven block, plus an anchor head for a sequence. The wallet wires the proof source to Helios and the leaf source to the Anon-RPC worker or the snapshot mirror. Tests wire both to in-memory fakes.
- One top-level sync call per set of pinned lists: prove the union of writers across all pinned lists in one storage proof request, sync each writer from its anchor, recompute, compare, checkpoint on finalized. One evaluate call per subject that runs against the synced set and returns a verdict of `clean`, `warn`, `block`, or `unavailable`, with the leaves, writers, and lists that produced it.
- The checkpoint store is an injected key-value interface. The wallet backs it with IndexedDB, tests with a map.
- Mismatch handling follows the ERC's step 4 exactly: discard, rewind to last finalized checkpoint, retry once, then mark the writer unavailable and surface the sequence number where the recomputed chain first diverged from the source's claimed head.
- Leaf and list hashing use viem's `encodeAbiParameters` and `keccak256` with the ERC's exact tuple layouts, so the TypeScript hashes match the Solidity ones byte for byte. The test suite pins this with a fixture generated by the Foundry tests.
- Policy is the ERC's recommended policy with no extensions. The library documents it as the applied policy, as the ERC requires.
- Category 4 self-check: evaluate takes an optional "own account code" value from the proof source and, if it begins with `0xef0100`, evaluates the following address as a category 4 subject.

### Trust lists

- List document wire format is JSON with the `TrustList` and `Safelist` fields as named in the ERC. The root is the keccak256 of the ABI encoding of the typed struct, not of the JSON bytes, so any formatting of the document hashes the same.
- Signature is EIP-712 over `ListRoot(bytes32 root,uint64 version)` in the log's domain (name `ThreatFlagLog`, version `1`, Sepolia chain id, log address).
- A small CLI in the reader package builds, signs, and emits the record value for a list, so a maintainer never hand-assembles the hex.
- Publication for the demo is method (b) of the ERC: an ENS text record under `erc-threat-flag-log.list` (and `erc-threat-flag-log.safelist`) whose value is the hex of `abi.encode(root, version, signature, listURI)`.
- `listURI` for the demo points at a static file in the wallet's build and at the snapshot mirror. Content addressing (IPFS) is a later step.
- ENSv2: the team's name is mounted as a subregistry, each writer is a subname, the list record lives in a permissioned resolver record, and Enhanced Access Control grants the publishing role to the maintainer key. The reader reads the record through Helios `eth_call` with CCIP-read off. If the subregistry route is not standing by the end of phase 4, the fallback is a plain ENSv1 text record read the same way; the maintainer signature carries the trust either way.
- Reader pinning: first accept stores maintainer and version per list name. A lower version is rejected. A different maintainer stops sync for that list and surfaces a confirmation prompt in the wallet; the library itself only returns the conflict.
- Two lists ship as defaults in the wallet. The team's manual writer at weight 255 in a list the wallet marks as blocking. The detector at warn weight in the same list. A second maintainer-independent list is not in scope; the two-independent-writers block path is exercised in tests, not on stage.

### Demo infrastructure

- Seed script: about fifty leaves across the manual writer and the detector, covering categories 1, 3, 6, and 7, one tombstone, one counter, one dispute. Runs through `append` for the manual writer and `appendSigned` through the relayer for the detector.
- Lying log proxy: a small HTTP JSON-RPC forwarder that passes every method through unchanged except `eth_getLogs`, where it drops one `Appended` log of the manual writer. The reader then reports a mismatch at that sequence.
- Snapshot mirror: a static JSON file per writer of its `Appended` events in writer-sequence order, as the ERC's data-availability section describes, served from the wallet's static host. The wallet's source switch points the leaf source at it.
- Detector: a Node script with its own key. Watches new Sepolia blocks for value transfers below a dust threshold to addresses that appear in a recent transfer history of the receiver with a matching prefix and suffix, resolves the authorizer (the UserOperation sender when the transaction targets an EntryPoint), batches category 1 leaves, signs, and hands the batch to the relayer. Rate-limited to a fixed number of leaves per hour. Evidence is the dust transaction hash.
- Relayer: a Node script with a separate funded key that submits `appendSigned` batches it receives from the detector. The relayer pays gas. The detector key never holds ETH.

### Wallet

- Next.js in the scaffold package, static export, no server routes, no analytics, no external requests other than the consensus endpoint, the Anon-RPC transport, and the leaf source.
- Helios runs in the browser against Sepolia with a pinned weak-subjectivity checkpoint and a user-editable consensus endpoint. The Anon-RPC worker is bootstrapped through Helios so its code hash is light-client verified. A `globalThis.fetch` shim routes Helios's execution RPC URL through the worker. Tor transport is the default (`0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e`), Nym the fallback (`0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0`). The passthrough specifier is never configured.
- Go or no-go at hour 6 per HANDOFF. If the worker bootstrap through Helios is not working, the fallback is Helios direct for proofs, Anon-RPC carrying only logs, ENS, and broadcast. The wallet copy then says which reads are anonymised.
- Account: a browser-local burner key for Sepolia, labelled as a demo wallet holding testnet funds only. No key of the team's is ever in the build.
- Screens: send (recipient with ENS resolution, amount with fiat, verdict panel, override after delay), sign (spender or permit spender, EIP-7702 delegate, the user's own account's current delegate), receive (own address plus recent counterparties with verdicts), lists (maintainer, version, fresh or stale, source switch between RPC and mirror).
- Verdict presentation: `block` shows writer name resolved from the list's operator namehash, category name, evidence hash with an explorer link, and the override control. `warn` shows the same without the override. `unavailable` shows which writer failed and at which sequence. `clean` is shown only when every pinned writer synced.
- Override: a local delay the wallet chooses (a few seconds on stage) and a second click. Nothing is sent anywhere.
- Frontend completeness per the frontend-ux ethskill: product identity replaced, address inputs resolve names and explain rejections, fiat on every amount, target chain is Sepolia, one pending state per button, errors translated near the action.

### Keys and secrets

- Deployer, maintainer, detector, and relayer keys are four separate keys. Each is read at run time from an ignored env file or a Foundry keystore. No key, RPC URL with an embedded token, or filled-in example lands in the repo.
- Any key that appears in a chat, a ticket, or a commit is treated as burned and replaced.

## Testing decisions

A good test exercises a public entry point and asserts a property the implementation could violate. No test asserts stored state against the value just written, a getter against its variable, or a constant against itself.

### Seam 1: the log contract through its public functions (Foundry)

- Normative cases 1 to 9 from the ERC's Test Cases section, each as its own test. These nine already passed on 5 November against the reference source and are re-created in the Foundry package.
- Fuzz: random leaves over the full field domains, random batch sizes from 1 to 500, random writers, asserting that sequence numbers increase by exactly one, heads change on every leaf, and the emitted event values equal the values the recomputation produces.
- Invariant with a handler: after any sequence of `append` and `appendSigned` calls from funded actors, replaying every emitted `Appended` event per writer from the zero head reproduces the stored writer head at the stored writer sequence, and the same for the global chain. The handler owns actors, signing, and bounded inputs. The revert rate from the run output is checked and `fail_on_revert` is on while building the handler.
- Boundary cases: op 3 valid and op 4 reverting, evidence zero on flag reverting and on tombstone allowed, dispute with subject equal to writer allowed and not equal reverting, deadline exactly equal to the timestamp allowed and one second past reverting, nonce equal allowed and nonce plus one reverting, a malleable high-s signature rejected, an ERC-1271 writer returning the wrong magic value rejected.
- Storage layout: slot values read with `vm.load` at the ERC's slot formulas, which is case 9 and is what the reader's proof path depends on.
- Gas: a batch of one hundred leaves measured and recorded so the README figure is reproducible.
- No fork tests. The contract calls no external protocol.
- Slither runs with no high or medium finding left unaddressed.

### Seam 2: the reader through its top-level sync and evaluate calls (Vitest)

- Both injected sources are in-memory fakes. The proof fake returns a chosen block and chosen slot values. The leaf fake returns a chosen event array and anchor. The checkpoint store is a map.
- Hash parity: a fixture of leaves, leaf hashes, writer heads, and global heads emitted by the Foundry suite is loaded and the TypeScript recomputation must match every value.
- Normative cases 10, 11, and 12 from the ERC, each as its own test.
- Lying source: the leaf fake drops one leaf, alters one leaf, appends one leaf beyond the proven sequence, and reorders two leaves. Each yields `unavailable` for that writer with the diverging sequence, after one rewind-and-retry, and never `clean` for any subject of that writer.
- Anchor handling: first sync from an untrusted anchor lands on the proven head; a second sync starts from the persisted checkpoint and syncs only the suffix; a checkpoint is written only when the proven block is finalized.
- Policy: one listed writer gives `warn`; two independent writers give `block`; two writers sharing an operator give `warn`; two writers sharing a non-zero upstream give `warn`; one writer at weight 255 in a blocking list gives `block` and the same writer in a non-blocking list gives `warn`; a tombstone from the same writer clears; a tombstone from a different writer is ignored; a counter from an independent writer reduces two writers to one; a dispute changes nothing in the verdict; a safelisted subject caps at `warn`; a noisy category is ignored without its bit and counted with it; `chainId = 0` in category 3 applies only to the log's chain; block range and head pin exclude leaves outside the range.
- Lists: a document whose hash does not match the published root is rejected; a bad maintainer signature is rejected; a lower version than the pinned one is rejected; a different maintainer returns a conflict and does not replace the pinned list; an unverifiable record leaves the last verified version active and marked stale; zero resolvable writers gives `unavailable`.
- Category 4 self-check: an own-account code beginning with `0xef0100` followed by a flagged delegate gives the delegate's verdict.

### Not automated

Wallet screens, Helios bootstrap, the Anon-RPC worker, ENS resolution, the detector, and the relayer are covered by a manual demo checklist run at the two rehearsals: the three beats, both transports, the override, the source switch, a stale list, and a fresh-install sync time.

### Prior art

None in this repo. The contract tests follow the ERC's Test Cases list. The reader tests follow the ERC's Light-client read procedure and Reader policy sections, one test per numbered rule.

## Out of scope

- Mainnet deployment, real mainnet flags, and the Anon-RPC adopters PR. The user chose Sepolia only for now. HANDOFF phase 7 is deferred.
- The Arkiv mirror.
- Blob mode, Bloom-filter mode, the state-storage fallback for data availability, and the packed `appendPacked` variant.
- A second independent list maintainer on stage. The two-independent-writers path is tested, not demoed.
- Private information retrieval, per-subject queries, and any on-chain mirror contract for contract consumers.
- Bonds, juror disputes, and any writer admission mechanism.
- The backtest, the Ethereum Magicians thread, the ERC PR, and the PRD update. These are pre-ERC-submission items, not build items.
- Landing page design changes.
- Hardware wallet or WalletConnect support in the demo wallet.
- Chainlink CRE, or any hosted automation for the detector.
- Any contract beyond the single log. No list contract on-chain in this spec; method (a) publication is not built.

## Further notes

- Conflict with HANDOFF: HANDOFF's settled decisions include a mainnet deploy at the same CREATE2 address and two or three real mainnet flags before judging. The user chose Sepolia only for this spec. The CREATE2 salt-zero deploy keeps that door open; nothing here prevents a later mainnet deploy at the same address.
- Conflict with the indexing ethskill: it says historical data must come from an indexer and never from a log scan at request time. The ERC and HANDOFF settle this differently. The reader tails from a persisted checkpoint and syncs only the pinned writers' suffix, which is the incremental tail the skill asks for without a hosted indexer, and the snapshot mirror is the cold-start path. A hosted indexer would reintroduce a trusted party and is not built.
- Conflict with the security ethskill: it prefers OpenZeppelin's EIP-712 implementation over hand-rolled recovery. The reference implementation hand-rolls it and already handles the chain-id re-derivation and the high-s check. HANDOFF says to extract the reference section as-is, and the ERC must stay dependency-free. Keep the reference source. The Foundry boundary tests cover the cases OpenZeppelin would have covered.
- The ERC's `discussions-to` still reads TODO. Not a build item.
- The ERC's Deployment section says the canonical address and runtime code hash will be recorded once deployed. After the Sepolia deploy, record the Sepolia address and code hash in the ERC and rebuild the site page, with a note that it is the testnet deployment.
- Glossary and ADRs do not exist yet. Terms used here come from the ERC's Definitions section: log, writer, leaf, subject, head, trust list, maintainer, reader, independent writers. The verdict names `clean`, `warn`, `block`, `unavailable` and the words "proof source", "leaf source", "checkpoint", "anchor", and "lying proxy" are new and are candidates for a glossary.
- Build order follows HANDOFF: Helios and Anon-RPC first (riskiest), then deploy and seed and reader, then lying proxy and mirror, then ENS, then detector, then wallet screens. Issues should be split per phase in this directory's `issues/` folder.
