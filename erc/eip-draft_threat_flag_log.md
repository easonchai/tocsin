---
title: Append-Only Threat Flag Log
description: An immutable, namespaced, light-client-verifiable log of flagged addresses with reader-chosen trust lists.
author: Eason Chai (@easonchai)
discussions-to: https://ethereum-magicians.org/t/erc-append-only-threat-flag-log/TODO
status: Draft
type: Standards Track
category: ERC
created: 2026-11-04
requires: 712
---

## Abstract

This ERC defines a singleton, immutable, append-only log in which any account may record a flag about an address (an "antibody") under its own namespace. The contract computes a hash chain per writer and one global hash chain, so no writer can remove or rewrite another writer's record and no administrator exists. Flags carry a category, an evidence hash, and an operation (flag, tombstone, counter, dispute); nothing is ever deleted. Trust is not assigned by the log. It is assigned by trust lists: signed, versioned sets of writers with weights and block-range pins that a reader chooses and may fork. The log is laid out so that a light client proves one storage slot, syncs the leaf set from any untrusted mirror, and evaluates every address locally, leaking no query. The ERC specifies the log interface, the leaf encoding, the trust-list encoding, and a recommended reader policy. It does not specify who is right.

## Motivation

Wallets and explorers today decide whether an address is dangerous by asking a company. Explorer labels, phishing databases, and simulation vendors each hold a private list, serve it from an API, and see every address a user asks about. A wallet that embeds a light client and refuses to trust an RPC still has to trust a label server, so the one check that prevents the most common losses (address poisoning, approval phishing, and drainer sweeps) is the one check that remains unverifiable and non-private.

Public measurements show why a list helps and where it does not. Across 270 million poisoning transfers on Ethereum and BSC between July 2022 and June 2024, about 1 lookalike address in 9,000 was ever paid, and the lookalike landed within minutes of the victim's genuine transfer (Tsuchiya et al., USENIX Security 2025). A list cannot beat a local prefix/suffix heuristic on a fresh lookalike. The same measurements show that the infrastructure behind the lookalikes is reused: 49 operator groups sent 97% of poisoning dust, about 8,000 funding addresses sat behind more than 6 million lookalikes (Guan and Li, CCS 2024), single master addresses coordinated more than 180,000 lookalikes each (Dau et al., 2026), and the fee-split contract of the most active drainer kit has appeared unchanged in every observed attack since September 2023. In June 2023, the largest explorer had labelled 0.002% of the phishing addresses one research team could detect. The information that would protect later victims exists; it is not shared in a form a wallet can verify.

The only on-chain address list Ethereum has had, a sanctions oracle written by one company into a boolean per address, was deprecated in March 2026 when that company's interest lapsed. Permissionless curation registries with bonds and juror disputes have run in production only for slow, positive identification tags. Pure permissionless writes with any aggregation rule are exploitable: "any writer" lets one key flag an exchange hot wallet, and "median" lets a scammer whitewash with sybil entries.

This ERC takes the shape that has worked for comparable problems off-chain. Certificate Transparency logs are dumb, append-only, and run by many parties; browsers choose which logs to trust. Token lists are curated by named maintainers and chosen by wallets. The log in this ERC is the dumb part. Trust lists are the chosen part. Standardizing both is necessary because the writers (security teams, explorers, automated detectors) and the readers (wallets, guards, agents) will never coordinate directly. Without a shared leaf encoding every wallet writes a parser per writer; without a shared list encoding every curator invents its own format; and without a shared read procedure the light-client property is lost at the first integration.

[ERC-8004](./eip-8004.md) standardized where agent reputation signals live and what shape they have, leaving aggregation to consumers. This ERC does the same for negative signals about addresses, with two differences forced by the subject matter: subjects never consent, so there is no token or registration per subject, and the data must be checkable without trusting the server that provides it, so the storage layout is designed for storage proofs and full local sync rather than per-address queries.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Definitions

- **Log**: the singleton contract defined by this ERC on a given chain.
- **Writer**: the account whose namespace a leaf is appended to. It is the transaction sender, or the signer recovered from a writer signature.
- **Leaf**: one record appended to the log.
- **Subject**: the address a leaf is about.
- **Head**: the current value of a hash chain. There is one head per writer and one global head.
- **Trust list** (or **list**): a signed, versioned set of list entries published by a maintainer and chosen by a reader.
- **Reader**: any software that evaluates leaves against one or more lists. Wallets, transaction guards, explorers, and agents are readers.
- **Independent writers**: two writers whose list entries declare different operators and different upstreams.

### Overview

Writers append leaves. The log folds every leaf into the writer's chain and the global chain, records the block number and a per-writer and global sequence number, and emits the leaf. Readers obtain the global head by a storage proof, obtain the leaves from any source, recompute the chains, and apply the lists they have pinned. The log assigns no weight, computes no score, and has no privileged account.

### Leaf

```solidity
struct Leaf {
    uint64  chainId;   // 0 means every EVM chain; otherwise the chain the subject is flagged on
    address subject;   // the flagged address
    uint8   category;  // see Categories
    uint8   op;        // 0 FLAG, 1 TOMBSTONE, 2 COUNTER, 3 DISPUTE
    bytes32 evidence;  // a transaction hash, or keccak256 of an off-chain evidence bundle
    uint64  seenBlock; // block at which the evidence was observed, on chainId
    bytes32 refLeaf;   // leafHash of the leaf this leaf refers to; zero for FLAG
}
```

- `op` MUST be one of the four values above. Implementations MUST revert on any other value.
- A `TOMBSTONE` leaf MUST set `refLeaf` to the hash of a leaf previously appended by the same writer. The log MAY check this; readers MUST check it.
- A `COUNTER` leaf MUST set `refLeaf` to the hash of a leaf appended by any writer. It records that the writer disagrees with that leaf.
- A `DISPUTE` leaf MUST have `subject` equal to the writer. It records that the subject objects to being flagged. The log MUST NOT treat it as anything other than a leaf.
- `evidence` MUST NOT be zero for a `FLAG` leaf.

### Leaf hash and chains

For a leaf appended by `writer` in block `blockNumber` with per-writer sequence number `writerSeq` and global sequence number `globalSeq`:

```text
leafHash   = keccak256(abi.encode(writer, blockNumber, writerSeq, globalSeq, leaf))
writerHead = keccak256(abi.encodePacked(previousWriterHead, leafHash))
globalHead = keccak256(abi.encodePacked(previousGlobalHead, leafHash))
```

- Sequence numbers start at 1 for the first leaf and increase by exactly 1 per leaf.
- The initial value of every head is `bytes32(0)`.
- The log MUST compute `leafHash`, `writerHead`, and `globalHead` itself. It MUST NOT accept a head, root, or leaf hash from the caller.
- The log MUST apply leaves in a batch in calldata order, and MUST update storage once per batch per head.

### Interface

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

interface IThreatFlagLog {
    event Appended(
        address indexed writer,
        address indexed subject,
        uint64  indexed writerSeq,
        uint64  globalSeq,
        uint64  blockNumber,
        bytes32 leafHash,
        bytes32 writerHead,
        bytes32 globalHead,
        Leaf    leaf
    );

    /// @notice Append leaves under msg.sender's namespace.
    function append(Leaf[] calldata leaves) external;

    /// @notice Append leaves under the namespace of the EIP-712 signer.
    /// @param deadline  block.timestamp after which the signature is invalid
    /// @param nonce     the writer's current signature nonce
    function appendSigned(
        Leaf[] calldata leaves,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external;

    function globalHead() external view returns (bytes32);
    function globalSeq() external view returns (uint64);
    function writerHead(address writer) external view returns (bytes32);
    function writerSeq(address writer) external view returns (uint64);
    function signatureNonce(address writer) external view returns (uint256);
}
```

- `append` MUST use `msg.sender` as the writer.
- `appendSigned` MUST recover the writer from an [EIP-712](./eip-712.md) signature over the struct `Append(bytes32 leavesHash,uint256 deadline,uint256 nonce)` where `leavesHash = keccak256(abi.encode(leaves))`, with domain name `"ThreatFlagLog"` and version `"1"`. It MUST revert if `block.timestamp > deadline` or if `nonce != signatureNonce(writer)`, and MUST increment `signatureNonce(writer)` on success.
- Both functions MUST emit `Appended` once per leaf, in order, with the values used in the chain computation.
- Both functions MUST revert if `leaves` is empty.
- The log MUST NOT expose any function that modifies a head other than by appending a leaf. It MUST NOT be upgradeable, pausable, or ownable.
- `globalHead` and `globalSeq` MUST each occupy exactly one storage slot at a documented, fixed position so that a storage proof for them can be constructed from the contract address alone. The reference implementation places `globalHead` at slot 0 and `globalSeq` at slot 1.

### Categories

Categories identify the class of infrastructure a subject belongs to. They are deliberately limited to classes that attackers reuse across victims, because a reader that syncs every leaf pays for every leaf.

| Value | Name | Subject | Evidence |
| --- | --- | --- | --- |
| 1 | `POISONING_OPERATOR` | The externally owned account that paid gas for a transfer intended to plant a lookalike address in a victim's history | The transaction hash |
| 2 | `POISONING_FUNDER` | An account whose outgoing transfers funded addresses later flagged under category 1 or 6 | A transaction hash of a funding transfer |
| 3 | `DRAINER_RECEIVER` | A contract or account to which drainer instances forward stolen assets | A transaction hash showing the forwarding |
| 4 | `MALICIOUS_DELEGATE` | A contract whose code, when set as an account's delegation target, transfers the account's assets to a hard-coded address | The transaction hash of a sweep |
| 5 | `MALICIOUS_TOKEN` | A token contract whose purpose is to emit misleading transfer events | The transaction hash of the deployment or of an emission |
| 6 | `PAID_LOOKALIKE` | A lookalike address that a victim actually paid | The transaction hash of the victim's payment |
| 7 | `DRAINER_SPENDER` | A contract that received token approvals or permits and used them to drain | The transaction hash of a drain |
| 8 to 127 | Reserved | Future permanent categories assigned by revision of this ERC | |
| 128 to 255 | Noisy | Categories a writer defines for high-volume, low-permanence data such as unpaid lookalikes | |

- Writers SHOULD NOT use categories 1 to 7 for a subject whose role is established only by the `from` or `to` field of an event log, because any contract can emit such a log naming any address. The subject's role SHOULD be established by a transaction the subject signed, by code the subject holds, or by a transfer of value from the subject.
- Readers MUST NOT, by default, download or evaluate leaves in categories 128 to 255. A reader MAY opt in per list.

### Trust lists

A trust list assigns weight to writers. The log has no knowledge of lists.

```solidity
struct ListEntry {
    address writer;
    uint8   weight;      // 0 to 255; a reader sums weights toward its thresholds
    bytes32 operator;    // keccak256 of the operating organization's canonical name, lowercase
    bytes32 upstream;    // keccak256 of the canonical name of the data source the writer republishes, or 0 if original
    uint64  fromBlock;   // count leaves with blockNumber >= fromBlock
    uint64  toBlock;     // 0 = open; otherwise count leaves with blockNumber <= toBlock
    bytes32 headPin;     // 0 = follow the writer's chain; otherwise count only leaves up to and including this writerHead
    uint16  categories;  // bitmask; bit i set means the writer is trusted for category i, for i in 1..15; bit 0 set means all
}

struct TrustList {
    address log;         // the log contract this list applies to
    uint64  chainId;     // chain the log is deployed on
    uint64  version;     // increases by 1 per publication
    ListEntry[] entries;
}
```

- `listRoot = keccak256(abi.encode(trustList))`.
- A list MUST be published in at least one of two ways. (a) On-chain: a contract exposing `function listRoot() external view returns (bytes32)` and `function listURI() external view returns (string memory)`, where the URI resolves to the encoded `TrustList`. (b) Through a name record: a text or data record under the key `erc-threat-flag-log.list` whose value is `abi.encode(listRoot, version, listURI)`. When the final ERC number is assigned, the key becomes `erc-N.list`.
- Readers MUST verify that the fetched `TrustList` hashes to the published `listRoot` before applying it.
- Entries sharing the same `operator` or the same non-zero `upstream` MUST be treated as one writer when counting independent writers.
- A `headPin` entry MUST be evaluated by recomputing the writer's chain and counting only leaves at or before the leaf whose `writerHead` equals `headPin`. If no such leaf exists, the entry MUST be ignored.

### Reader policy

The following policy is RECOMMENDED as the default. A reader MAY implement any policy; it MUST document which policy it applies.

1. A subject with a live `FLAG` leaf from one listed writer, in a category that writer is trusted for, produces a warning that names the writer, the category, and the evidence.
2. A subject with live `FLAG` leaves from two independent listed writers, or from one listed writer with weight 255 in a list the reader marked as blocking, produces a block. A block SHOULD be overridable by the user after a delay or a second factor.
3. A `FLAG` leaf is not live if the same writer has appended a `TOMBSTONE` referencing it.
4. A reader SHOULD pin a safelist, published as a trust list with `weight` 0, naming subjects that are never blocked. Flags on safelisted subjects produce at most a warning.
5. Escalation is OR across pinned lists: if any list reaches its block threshold the reader blocks. De-escalation requires the flagging writer's tombstone.
6. A `DISPUTE` leaf changes only presentation. A reader MAY show that the subject objected.
7. A `COUNTER` leaf from an independent listed writer MAY reduce the effective writer count of the countered leaf by one in the reader's policy.

### Light-client read procedure

A reader that does not trust its data provider MUST obtain the data as follows.

1. Obtain a block header whose execution state root the reader has verified by a method it trusts (for example, a consensus light client following sync committee signatures to finality).
2. Obtain a storage proof for the log contract's `globalHead` and `globalSeq` slots against that state root and verify it.
3. Obtain all leaves with `globalSeq` greater than the reader's last synced sequence, from any source. Acceptable sources include `eth_getLogs` from any node, a content-addressed snapshot, or a blob archive.
4. Recompute `leafHash` and the global chain from the reader's last verified head over the obtained leaves. If the result does not equal the proven `globalHead` at the proven `globalSeq`, the reader MUST discard the data and MUST NOT report any subject as unflagged on the basis of it.
5. Apply pinned lists to the verified leaf set and evaluate subjects locally.

A reader MUST NOT query the log, a mirror, or any server for an individual subject as part of evaluating a transaction, because such a query reveals the subject to the server.

### Blob mode (OPTIONAL)

A log MAY expose `function appendCommitment(bytes32 batchRoot, uint32 count, uint8 blobIndex) external`, in which the leaves travel in an [EIP-4844](./eip-4844.md) blob attached to the transaction. The log MUST read the blob's versioned hash with the `BLOBHASH` opcode at `blobIndex`, and MUST compute `leafHash = keccak256(abi.encode(writer, blockNumber, writerSeq, globalSeq, batchRoot, versionedHash, count))`, advancing `writerSeq` and `globalSeq` by `count`. `batchRoot` MUST be the root of a binary Merkle tree over `keccak256(abi.encode(leaf))` for the leaves in the blob, in order. Readers reconstruct leaves from an archived blob and verify them against `batchRoot`; the on-chain `versionedHash` lets any reader verify that the archived blob is the one committed. A log that implements blob mode MUST emit `CommitmentAppended(address indexed writer, uint64 indexed writerSeq, uint64 globalSeq, uint64 blockNumber, bytes32 batchRoot, bytes32 versionedHash, uint32 count, bytes32 leafHash, bytes32 writerHead, bytes32 globalHead)`.

### ERC-165

A log MAY implement [ERC-165](./eip-165.md). If it does, it MUST return `true` for the interface identifier of `IThreatFlagLog`.

## Rationale

### The contract computes the chains

Early designs let writers submit a Merkle root per batch. A root supplied by the writer cannot be checked by the contract, so one writer could post a root that omitted other writers' leaves, and a reader could not tell omission from absence. Having the contract hash every leaf costs about 2,500 gas per leaf in calldata and makes omission impossible. The cost is paid by writers, who write rarely, instead of by readers, who read constantly.

### Nothing is deleted

Every flagged account in categories 1, 2, and 6 is controlled by the attacker, and a flagged contract can implement any signature-validation interface to return success. Any removal path keyed on the subject's consent is therefore a removal path for the attacker. Corrections are new leaves. A reader that wants a flag gone follows the writer's tombstone or drops the writer from its list.

### Namespaces instead of admission

A writer set that is admitted by a committee, a bond, or a juror pool becomes the chokepoint: the committee is captured, the bond prices out nonprofits while a profitable attacker posts it, and juror disputes have only been shown to work for slow positive facts. Letting anyone write into a namespace that carries no weight removes the chokepoint and makes sybils free to tolerate. The cost is that trust has to come from somewhere else, which is the next section.

### Reader-chosen trust lists

No symmetric reputation function is sybil-proof, so the ERC makes trust asymmetric: writers have no identity beyond a key, and lists have a named maintainer. This is the model of browser root stores, filter lists, and token lists, all of which have resisted sybils for years without bonds or tokens. Lists are forkable, their publication is a public record, and a reader that disagrees with a maintainer changes one setting. The honest consequence is that at launch there will be one or two maintainers, which is close to the status quo, with the difference that the record is verifiable and no maintainer can erase another writer's leaf.

### Declared independence

Counting two writers as independent only when both their operator and their upstream differ is what prevents one organization from meeting a two-writer threshold with two keys, and what prevents two honest writers that both mirror the same vendor from double-counting. The declaration is made by the list maintainer, not by the writer, so a writer cannot claim independence it does not have.

### Block-range and head pins

A list entry that names a block range lets a maintainer cut a compromised writer at the block the key leaked, with one record update that every reader applies on its next sync. A head pin gives the equivalent of a version lock: the reader trusts a writer's chain up to an exact head and ignores later appends until the list advances. Both are evaluated from the replayed log alone, so neither needs new contract state.

### One global head and full local sync

A per-subject storage proof reveals the queried subject to whoever serves the proof, and a server that also serves the user's balance queries can combine a prefix with the user's counterparty graph. Proving one slot and replaying the whole set costs a few megabytes a year at the intended scope and leaks nothing. This is also why the categories are restricted: a log that admitted every unpaid lookalike would be a gigabyte a year, which is a reader cost, not a gas cost. Private information retrieval would allow per-subject queries without the leak; when it is available, the restriction can be relaxed by a later revision.

### No per-subject storage

A mapping from subject to status would cost about 22,000 gas per subject and would invite readers to query it per subject, which is exactly the leak the layout avoids. Contract consumers that need an on-chain read can be served by a mirror contract fed by a relayer that verifies against `globalHead`; that mirror is outside this ERC because it reintroduces a trusted party.

### No score

A numeric score has no defined meaning across writers, cannot be combined across writers without an aggregation rule that sybils can exploit, and gives a wallet nothing to show a user. A category, a writer name, and an evidence hash do. Scoring, if wanted, happens in the reader.

### No token per subject

ERC-8004 mints a token per agent because agents register themselves and need transferable ownership of their identity. Subjects of this log never consent, so there is nothing for them to own, and a token per subject would cost storage for every flag.

### Writer signatures

Allowing a relayer to submit a batch signed by the writer lets a nonprofit writer keep a cold key and lets a grant or sponsor pay gas, without the log having to know anything about sponsorship.

### Singleton per chain

One log per chain gives readers one slot to prove and one event stream to follow. Because EOAs are identical on every EVM chain, a leaf with `chainId = 0` on the canonical deployment covers them everywhere, and a reader on any chain reads the canonical chain's log through that chain's light client. Deploying the log on several chains is permitted; readers choose which deployment they pin.

### Related work

The Ethereum Attestation Service offers generic attestations with consumer-chosen attesters, but attestations are stored per record, which both costs per-record gas and invites per-record queries; it also does not prevent an attester from revoking. [ERC-7484](./eip-7484.md) lets an account choose attesters and a threshold for module safety and is the closest on-chain precedent for reader-chosen trust. [ERC-8259](./eip-8259.md) defines a threat registry for agents with whitelisted oracle writers and per-record storage; this ERC's category table is intended to be alignable with its attack-vector taxonomy. Certificate Transparency is the closest precedent for the log itself.

## Backwards Compatibility

No backward compatibility issues found. The log is a new contract and the list encoding is new. Readers that already consume vendor labels can add a list without removing anything.

## Test Cases

Test vectors accompany the reference implementation. The following cases are normative.

1. Appending one `FLAG` leaf from a fresh writer yields `writerSeq = 1`, `globalSeq = n + 1`, `writerHead = keccak256(abi.encodePacked(bytes32(0), leafHash))`, and one `Appended` event whose fields equal the stored values.
2. Appending a batch of three leaves updates each head three times in calldata order and emits three events with consecutive sequence numbers.
3. `append` with an empty array reverts.
4. A leaf with `op = 4` reverts.
5. A `FLAG` leaf with `evidence = 0` reverts.
6. `appendSigned` with a signature whose nonce is stale reverts; with a correct nonce, the writer in the event is the signer, not the transaction sender, and the nonce advances by one.
7. Replaying all `Appended` events from genesis and recomputing the global chain reproduces the stored `globalHead` at the stored `globalSeq`.
8. A list with two entries sharing an `operator` counts as one writer in the reference reader; two entries with different operators and different upstreams count as two.
9. A `TOMBSTONE` referencing a leaf from a different writer is ignored by the reference reader.
10. A reader given a leaf set whose recomputed head differs from the proven head reports "unavailable" and not "clean" for every subject.

## Reference Implementation

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

contract ThreatFlagLog {
    struct Leaf {
        uint64  chainId;
        address subject;
        uint8   category;
        uint8   op;
        bytes32 evidence;
        uint64  seenBlock;
        bytes32 refLeaf;
    }

    bytes32 public globalHead;   // slot 0
    uint64  public globalSeq;    // slot 1
    mapping(address => bytes32) public writerHead;
    mapping(address => uint64)  public writerSeq;
    mapping(address => uint256) public signatureNonce;

    bytes32 private constant APPEND_TYPEHASH =
        keccak256("Append(bytes32 leavesHash,uint256 deadline,uint256 nonce)");
    bytes32 private immutable DOMAIN_SEPARATOR;

    event Appended(
        address indexed writer, address indexed subject, uint64 indexed writerSeq,
        uint64 globalSeq, uint64 blockNumber, bytes32 leafHash,
        bytes32 writerHead, bytes32 globalHead, Leaf leaf
    );

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ThreatFlagLog"), keccak256("1"), block.chainid, address(this)
        ));
    }

    function append(Leaf[] calldata leaves) external {
        _append(msg.sender, leaves);
    }

    function appendSigned(
        Leaf[] calldata leaves, uint256 deadline, uint256 nonce, bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "expired");
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(APPEND_TYPEHASH, keccak256(abi.encode(leaves)), deadline, nonce))
        ));
        address writer = _recover(digest, signature);
        require(nonce == signatureNonce[writer], "nonce");
        signatureNonce[writer] = nonce + 1;
        _append(writer, leaves);
    }

    function _append(address writer, Leaf[] calldata leaves) internal {
        uint256 n = leaves.length;
        require(n > 0, "empty");
        bytes32 wHead = writerHead[writer];
        bytes32 gHead = globalHead;
        uint64 wSeq = writerSeq[writer];
        uint64 gSeq = globalSeq;
        for (uint256 i = 0; i < n; i++) {
            Leaf calldata leaf = leaves[i];
            require(leaf.op <= 3, "op");
            require(leaf.op != 0 || leaf.evidence != bytes32(0), "evidence");
            require(leaf.op != 3 || leaf.subject == writer, "dispute");
            wSeq++; gSeq++;
            bytes32 leafHash = keccak256(abi.encode(writer, uint64(block.number), wSeq, gSeq, leaf));
            wHead = keccak256(abi.encodePacked(wHead, leafHash));
            gHead = keccak256(abi.encodePacked(gHead, leafHash));
            emit Appended(writer, leaf.subject, wSeq, gSeq, uint64(block.number), leafHash, wHead, gHead, leaf);
        }
        writerHead[writer] = wHead;
        writerSeq[writer] = wSeq;
        globalHead = gHead;
        globalSeq = gSeq;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "sig");
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "s");
        address a = ecrecover(digest, v, r, s);
        require(a != address(0), "recover");
        return a;
    }
}
```

## Security Considerations

**Framing through forged evidence.** Any contract can emit an event naming any address. A writer that derives a subject's role from an event's `from` or `to` field can be induced to flag an exchange hot wallet, a router, or a treasury that does not yet exist. The category table therefore asks writers to establish roles by signed transactions, held code, or value transfers from the subject, and the recommended policy caps safelisted subjects at a warning. Readers should treat a writer that has flagged safelisted subjects as a candidate for removal from their lists.

**Compromised writer keys.** A writer's hot key, once stolen, can append thousands of flags in one block. The log cannot prevent this and should not try, since any mechanism that lets the log reject leaves is a mechanism that lets someone censor them. The defences are in lists and readers: a maintainer cuts the writer at the compromise block, two independent writers are needed to block, and safelisted subjects are never blocked. Writers are advised to keep the signing key separate from any key that holds value and to rate-limit their own detectors.

**Permanent false positives.** Because nothing is deleted, a wrong flag is visible forever. The recommended policy clears a single-writer flag on the writer's tombstone and shows a flag made by two independent writers as "previously flagged" after tombstones, so that the history is honest without the warning persisting. Maintainers of lists carry the reputational consequence of listing careless writers, which is the intended incentive.

**Liability.** A leaf is a category and a hash, not an accusation in prose. Readers that block on leaves make a decision the leaf did not make. Readers should present the writer, the category, and the evidence rather than an unattributed verdict, and should allow an override.

**Sybil lists.** The log makes sybil writers harmless; it cannot make sybil lists harmless. A reader that pins a list from an unknown maintainer is trusting that maintainer. Wallets should ship with a small default set of lists from named organizations and should make the active set visible to the user.

**Data availability.** Leaves live in calldata and events, which any archive node can serve and any party can mirror. Blob mode depends on at least one party archiving the blob within the retention window; the on-chain versioned hash means the archive need not be trusted, only present. Readers that cannot obtain leaves must report the registry as unavailable, never as clean.

**Attacker adaptation.** The reuse measurements that justify the category table were taken before any reader consumed such a log. A funding hop costs a fraction of a cent, and a drainer kit can move its receiver out of bytecode once a wallet enforces on it. The log's value is bounded by how expensive it is for attackers to abandon the flagged layer, and lists should expect to re-aim categories over time.

**Light-client assumptions.** The read procedure is only as strong as the reader's method of verifying a state root. A consensus light client trusts its weak-subjectivity checkpoint and the sync committee. A reader that takes the head from an ordinary RPC keeps the privacy property and loses the verifiability property, and should say so.

**Gas griefing of writers.** A writer that flags at the attacker's volume lets the attacker set the writer's gas bill. This is why unpaid lookalikes belong in noisy categories or off the log entirely, and why writers in the permanent categories should flag the operator behind the dust rather than each dust address.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
