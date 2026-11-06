# Log contract: ThreatFlagLog on Sepolia

Status: ready-for-agent
Created: 2026-11-06

## Source documents

- PRD and normative spec: `docs/spec/threat-flag-log.md`. Every decision below cites the spec section it implements. If the code has to deviate from the spec, the deviation is a bug in one of them: stop, flag it, and fix the spec or the code, never silently diverge.
- Settled decisions: `HANDOFF.md`. It wins over ethskill advice.
- Companion spec: `docs/plan/demo/spec.md` covers the reader library, trust lists, and the demo wallet that consume this contract.
- Ethskills: every ticket under `issues/` carries an `Ethskills:` line naming the rows of the AGENTS.md table it matches. Load them before starting the ticket. HANDOFF wins where they conflict.

## Problem statement

Security teams and detectors know which addresses are scam infrastructure, but there is no shared place to record that where a wallet can verify the record, where nobody can edit or remove another party's record, and where the record does not require trusting an owner who may stop updating it. The one previous on-chain address list had an owner and was deprecated when the owner stopped (spec, Motivation).

## Solution

A single immutable contract where any account appends flags under its own namespace. The contract hashes every leaf into a per-writer chain and a global chain, keeps only the heads and sequence numbers in state at normative storage slots, and emits every leaf. There is no owner, no pause, no upgrade, no delete. A writer may send its own transaction or sign a batch for a relayer to submit. Deployed on Sepolia at a deterministic address that a later mainnet deployment will share (spec, Abstract; Specification, Overview; Deployment).

## User stories

1. As a security team, I want to append flags under my own address by sending a transaction, so that no committee has to admit me before I can publish (spec, Interface: `append`).
2. As a security team, I want to append a batch of leaves in one transaction, so that a flag costs about ten thousand gas instead of fifty thousand (spec, Rationale: The contract computes the chains).
3. As a security team with a cold key, I want to sign a batch with EIP-712 and let a relayer submit it, so that my signing key never holds gas (spec, Interface: `appendSigned`; Rationale: Typed signatures and relayed batches).
4. As a security team that signs from a Safe, I want the log to accept an ERC-1271 signature from my contract account, so that a multisig can be the writer (spec, Interface, `appendSigned` bullet).
5. As a writer, I want every leaf to carry a chain id, a subject, a category, an operation, an evidence hash, an observed block, and a reference leaf, so that a reader can show a user why, not just that (spec, Leaf).
6. As a writer, I want to append a tombstone referencing my own earlier leaf, so that I can retract a mistake without anyone deleting history (spec, Leaf, `TOMBSTONE` bullet; Rationale: Nothing is deleted).
7. As a writer, I want to append a counter referencing another writer's leaf, so that I can record disagreement on the record (spec, Leaf, `COUNTER` bullet).
8. As a flagged party, I want to append a dispute under my own address with the subject equal to me, so that readers can see I objected (spec, Leaf, `DISPUTE` bullet).
9. As a writer, I want the log to reject an operation above 3, a flag with zero evidence, and a dispute whose subject is not me, so that malformed leaves never enter my chain (spec, Leaf bullets; Test Cases 4 and 5).
10. As a writer, I want the log to reject an empty batch, so that a no-op transaction cannot advance a nonce or waste gas (spec, Interface, "MUST revert if `leaves` is empty"; Test Case 3).
11. As a writer, I want my signed batch bound to the log's chain and address, a deadline, and my current nonce, so that nobody can replay it elsewhere or later (spec, Interface, `appendSigned` bullet; Test Case 6).
12. As a writer, I want the signing domain to recompute after a chain split, so that a signature from one side cannot be replayed on the other (spec, Interface, domain separator bullet).
13. As a writer, I want the leaf hash to include my address, the block number, and both sequence numbers, so that the same leaf content from two writers or two blocks never collides (spec, Leaf hash and chains).
14. As a writer, I want leaves in a batch applied in calldata order with one storage write per head per batch, so that batching is cheap and the order is unambiguous (spec, Leaf hash and chains, last bullet).
15. As a writer, I want to know that no function can change a head other than by appending, and that the contract is not upgradeable, pausable, or ownable, so that nobody can rewrite my chain (spec, Interface, last bullet).
16. As a writer, I want to keep batches at or under 500 leaves, so that a batch fits the per-transaction gas cap (spec, Interface, EIP-7825 bullet).
17. As a reader, I want the global head, global sequence, writer head, writer sequence, and signature nonce at the normative storage slots, so that I can build a storage proof from the contract address alone (spec, Storage layout; Test Case 9).
18. As a reader, I want every `Appended` event to carry the writer, both sequence numbers, the leaf hash, both heads after the leaf, and the leaf itself, so that I can recompute the chain from events alone (spec, Interface, event; Test Case 8).
19. As a reader, I want the subject not indexed in the event, so that no node offers a per-subject filter that would leak my queries (spec, Interface, event doc comment; Rationale: No per-subject storage).
20. As a reader, I want the writer and writer sequence indexed, so that I can fetch one writer's suffix with a bounded log query (spec, Light-client read procedure, step 3).
21. As a reader, I want the global head provable for mirrors and archivers, so that a mirror can verify it holds everything (spec, Light-client read procedure, step 2).
22. As a wallet integrator, I want the contract to answer ERC-165 for the log interface, so that I can detect a conforming log (spec, ERC-165).
23. As the team, I want the contract deployed through the deterministic deployment proxy with salt zero, so that the Sepolia address equals the later mainnet address (spec, Deployment; HANDOFF).
24. As the team, I want the deployed contract verified on Sourcify and Etherscan in the same step as the deploy, so that judges and integrators see source, not bytecode.
25. As the team, I want the deploy script to compute the expected address, refuse to broadcast if code already exists there, and run a post-deploy append as a smoke test, so that the runbook is executable from the repo alone.
26. As the team, I want the Sepolia address and runtime code hash recorded in the spec's Deployment section and the site page rebuilt, so that the PRD and the deployment agree.
27. As the team, I want a README transition table for `append` and `appendSigned`, so that the ship checklist's caller and incentive question is answered in writing.
28. As the team, I want the gas of a hundred-leaf batch measured in the test suite, so that the README's "about half a cent a flag" is reproducible (HANDOFF, Gas).
29. As the team, I want all four of the spec's normative storage slot formulas checked by reading raw storage in tests, so that the reader's proof path cannot drift from the contract.
30. As the team, I want the Foundry tests to emit a fixture of leaves, leaf hashes, and heads, so that the reader library in the demo spec can prove hash parity against the contract.
31. As a writer signing from a hardware device or a Safe, I want an ERC-7730 clear-signing descriptor for `append`, `appendSigned`, and the `Append` typed data, so that the device shows each subject and category instead of a hash (spec, Interface, ERC-7730 bullet).

## Implementation decisions

### Source of the contract

- The contract is the spec's Reference Implementation section, extracted verbatim into the Foundry package. No OpenZeppelin dependency, no renaming, no reordering of state variables. Reason: the spec's Storage layout is normative, the reference passed nine tests on 5 November against this exact source, and the spec must stay CC0 and dependency-free (HANDOFF, What exists).
- The interface in the spec's Interface section is extracted as a separate interface file, and the contract is checked to match it. The ERC-165 identifier is computed from that interface.
- The spec's reference does not implement ERC-165. The spec says a log MAY implement it and MUST return true for the interface id if it does. Decision: add ERC-165 to the deployed contract and to the spec's reference section in the same commit, so the PRD and the code stay identical. This is the only addition to the reference source. Storage is unaffected because the implementation is a pure function.
- Compiler pinned to 0.8.28 as the spec's pragma states. Optimizer settings recorded in the Foundry config and in the spec's Deployment section next to the code hash, because the code hash depends on them.

### Normative behaviour, section by section

- Leaf validation (spec, Leaf): op 0 to 3 only; evidence non-zero for flag; dispute subject equals writer. Tombstone-references-own-leaf and counter-references-any-leaf are reader checks; the contract does not verify `refLeaf`, as the spec allows ("The log MAY check this"). Not checking keeps gas flat and avoids a per-leaf storage read.
- Hashing (spec, Leaf hash and chains): leaf hash is the keccak of the ABI encoding of writer, block number, writer sequence, global sequence, and the leaf tuple. Heads are keccak of the packed previous head and leaf hash. Sequence numbers start at 1. All heads start at zero. The contract computes everything; it accepts no hash from the caller.
- Signed batches (spec, Interface, `appendSigned`): typed structure `Append(Leaf[] leaves,uint256 deadline,uint256 nonce)` with the leaf array hashed as the keccak of concatenated leaf struct hashes. Domain name `ThreatFlagLog`, version `1`, Sepolia chain id, the contract address. Contract writers go through ERC-1271 `isValidSignature`; externally owned writers through `ecrecover` with the high-s check. Deadline is inclusive (`block.timestamp <= deadline` passes). Nonce must equal the stored nonce and advances by one.
- Domain separator (spec, Interface, domain bullet): cached at construction with the chain id, recomputed when the chain id differs.
- Storage layout (spec, Storage layout): slots 0 to 4 in the stated order. Nothing is added to state in this spec.
- Events (spec, Interface, event): one `Appended` per leaf, in order, with the values used in the chain computation. Writer and writer sequence indexed, subject not.
- Batch bound (spec, Interface, EIP-7825 bullet): a SHOULD for writers, not enforced by the contract. The seed script and the detector in the demo spec cap at 500.
- Categories and chain id (spec, Leaf, `chainId` bullet; Categories): the contract validates neither `category` nor `chainId`. The rule that `chainId = 0` is allowed only in categories 1, 2, 6, and 8, and the rule that category 8 (`THEFT_PROCEEDS`) alone should not block a send, are reader rules and live in the demo spec. The v2.1 category addition changes no contract code.
- Clear signing (spec, Interface, ERC-7730 bullet): the `Append` typed structure already signs the leaf array as typed structs with no hash-only field, so the reference complies. The descriptor the spec requires per deployment is a deliverable under Deployment.

### Deployment

- Target chain is Sepolia only, per the user's decision on 2026-11-06. Mainnet is deferred (HANDOFF phase 7).
- Deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt `bytes32(0)`, init code equal to the compiled contract with no constructor arguments (spec, Deployment). The deploy script computes the CREATE2 address, prints it, and aborts if code already exists there.
- Verification immediately after the deploy: Sourcify, then Etherscan. The Foundry package's explorer key comes from the environment, never from the repo.
- Post-deploy smoke test: one `append` of a single flag leaf from the deployer key, then a read of writer sequence equal to 1 and global sequence equal to 1.
- After deploy: record the Sepolia address, the runtime code hash, and the compiler and optimizer settings in the spec's Deployment section, labelled as the testnet deployment, and rebuild the site page.
- Deployer key is read at run time from a Foundry keystore or an ignored env file. No key, and no RPC URL carrying a token, is committed (wallets ethskill).
- ERC-7730 descriptor (spec, Interface, ERC-7730 bullet): one JSON file in the repo with a calldata format for `append` and `appendSigned` and an EIP-712 format for `Append`, each leaf field displayed, `category` and `op` shown by name through enums matching the spec's tables (categories 1 to 8, ops 0 to 3), and the Sepolia address in the deployments list. It passes the ERC-7730 schema check. The CREATE2 address is known before broadcast, so the file is written against the predicted address and linked from the spec's Deployment section.

### README additions

- Transition table (ship ethskill). `append`: caller is the writer; pays because being listed by maintainers is its distribution; if nobody calls, nothing changes. `appendSigned`: caller is any relayer; pays because the writer sponsors it or runs its own relayer; if nobody calls, the signed batch expires at its deadline and the nonce is untouched.
- Deploy runbook: the exact commands, required environment variables, the expected address, and the smoke test.

## Testing decisions

A good test exercises a public function and asserts a property the implementation could violate. No test asserts stored state against the value just written, a getter against its variable, or a constant against itself (testing ethskill).

The seam is the contract's public functions through Foundry. Nothing below it is tested.

- Normative cases 1 to 9 from the spec's Test Cases section, one test each, named after the case number. Cases 10 to 12 belong to the reader and live in the demo spec.
- Fuzz: random leaves over the full field domains, batch sizes from 1 to 500, random writers. Properties: writer sequence and global sequence increase by exactly one per leaf; every leaf changes both heads; the emitted leaf hash, writer head, and global head equal an independent recomputation in the test from the emitted inputs.
- Invariant with a handler: after any sequence of `append` and `appendSigned` calls from a set of funded signing actors, replaying every emitted `Appended` event per writer from the zero head reproduces the stored writer head at the stored writer sequence, and the same for the global chain. The handler owns actors, signing, and bounded inputs. The calls-to-reverts ratio is checked in the run output; `fail_on_revert` stays on while the handler is built.
- Boundaries, each its own test: op 3 accepted and op 4 rejected; evidence zero rejected on flag and accepted on tombstone; dispute with subject equal to writer accepted and not equal rejected; deadline equal to the timestamp accepted and one second past rejected; nonce equal accepted and nonce plus one rejected; a high-s signature rejected; a 64-byte signature rejected; an ERC-1271 writer returning the wrong magic value rejected; an ERC-1271 writer that reverts rejected.
- EIP-7702 writer: a writer whose code is a delegation designator takes the ERC-1271 path because it has code. With a delegate that implements `isValidSignature` the batch is accepted; with a delegate that does not, the batch is rejected even though the EOA key signed. Both cases are tests, set up with `vm.etch` of `0xef0100` plus the delegate address.
- Storage layout: `vm.load` at slots 0 and 1 and at the two mapping formulas from the spec, for two different writers, plus the nonce mapping at slot 4.
- ERC-165: true for the log interface id, true for the ERC-165 id, false for a random id.
- Domain: the separator equals a test-side EIP-712 computation on the default chain, and changes after `vm.chainId` to another value.
- Gas: a hundred-leaf batch snapshot recorded with Foundry's gas snapshot so the README figure is reproducible.
- Fixture: one test writes `dapp/packages/foundry/fixtures/parity.json`, a JSON file of leaves, their append block numbers, leaf hashes, writer heads, and global heads for a fixed scenario. The demo spec's reader tests load it for hash parity. Block number is in the fixture because the leaf hash commits to it and the event does not carry it.
- ERC-7730 descriptor: passes the schema check, and its category and op enums equal the spec's tables. No contract test, since the descriptor is not code.
- No fork tests. The contract calls no external protocol.
- Slither runs with no high or medium finding left unaddressed.

Prior art: none in the repo. The nine normative cases passed on 5 November against the reference source outside the repo (HANDOFF) and are re-created here.

## Success criteria

Done when all of these hold:

- Every test in Testing decisions passes, the invariant run shows a revert rate low enough that the handler reached real states, and slither reports no high or medium finding.
- The contract is deployed on Sepolia at the CREATE2 address the script predicted, verified on Sourcify and Etherscan, and the smoke-test append is visible on the explorer.
- The spec's Deployment section carries the Sepolia address, code hash, and compiler settings, links the ERC-7730 descriptor, and the ERC-165 addition is in the reference section.
- The README carries the transition table and a runbook someone else can follow from a fresh clone with only the env file.
- The fixture file exists and the demo spec's parity test loads it.

## Out of scope

- The reader library, trust lists, ENS records, the wallet, the detector, the relayer, the lying proxy, and the snapshot mirror. All in `docs/plan/demo/spec.md`.
- Mainnet deployment and real mainnet flags (HANDOFF phase 7, deferred by the user).
- Any on-chain list contract (spec publication method (a)).
- The packed `appendPacked` variant, blob mode, Bloom-filter mode, and state-storage data availability (spec, Rationale; HANDOFF).
- Contract-side verification of `refLeaf`.
- A mirror contract for on-chain consumers (spec, Rationale: No per-subject storage).
- The backtest.

## Further notes

- Discrepancy to resolve in the spec: the Test Cases section says test vectors accompany the reference implementation, but none are in the repo. The fixture produced by the Foundry suite becomes those vectors; the spec's Test Cases section names it.
- Discrepancy to resolve in the spec: the reference implementation does not implement ERC-165 while the ERC-165 section allows it. Decision above adds it to both.
- Discrepancy to resolve in the spec: the leaf hash commits to the append block number, but the `Appended` event does not carry it and the Data availability section describes a snapshot as "the ABI-encoded `Appended` events in `writerSeq` order". Such a snapshot cannot be replayed. The spec's snapshot description must add the block number per event. The event itself stays as is, since a log's block number is part of the receipt and adding a field would change gas. spec v2.1 repeats the same wording in the Trust lists `snapshotURI` bullet, so both places need the fix.
- Spec v2.1 (commit 41f3144, merged 2026-11-06) added category 8 `THEFT_PROCEEDS`, extended `chainId = 0` to category 8, required an ERC-7730 descriptor per deployment, added `snapshotURI` to `ListEntry`, and mentioned EIP-8304 as future verification. Checked against this spec on 2026-11-06: the contract source and storage are unaffected; the descriptor is the only new contract-side deliverable; the rest lands in the demo spec.
- Conflict with HANDOFF: its settled decisions say `chainId = 0` only for categories 1, 2, 6. The spec now adds 8. The spec is the PRD; HANDOFF's line is stale and should be updated by its owner.
- Discrepancy to resolve in the spec: Test Cases 10 to 12 name a "reference reader" that the spec does not contain. The demo spec's reader library is that reader; say so in the spec when the PR is prepared.
- Note for the spec's Typed signatures rationale: an EIP-7702-delegated writer has code and therefore signs through ERC-1271. Its delegate must implement `isValidSignature`, or the writer should use a plain EOA key. One sentence in the spec.
- Package pins verified on npm on 2026-11-06 (tools ethskill): forge 1.9.0 or newer per HANDOFF; create-eth 2.0.23 is current latest.
- Conflict with the security ethskill: it prefers OpenZeppelin's EIP-712 over hand-rolled recovery. The reference already handles chain-id re-derivation and the high-s check, HANDOFF says to extract the reference as-is, and the spec must stay dependency-free. Keep the reference source; the boundary tests cover what the library would.
- Glossary candidates from the spec's Definitions: log, writer, leaf, subject, head, maintainer, reader. No glossary or ADR exists yet.
