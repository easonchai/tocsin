# 04: Trust list documents, signing, and the publish CLI

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Trust lists; Testing decisions, lists. PRD: `docs/spec/threat-flag-log.md`, Trust lists.

**What to build:** A maintainer runs one CLI command over a list document and gets back the signed ENS record value; a reader given that document, root, signature, and version accepts it, pins the maintainer, and rejects anything tampered, older, or signed by someone else.

**Blocked by:** None (can start immediately)

**Ethskills:** tools, wallets, standards (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] JSON document with the `TrustList`, `Safelist`, and `ListEntry` fields as named in the spec, including `snapshotURI`; the root is the keccak of the ABI-encoded typed struct, never of the JSON bytes.
- [ ] EIP-712 `ListRoot(bytes32 root,uint64 version)` signature in the log's domain; the CLI reads the maintainer key from an ignored env file or keystore and emits the hex of `abi.encode(root, version, signature, listURI)`.
- [ ] Unsigned `labels` map verified by ENSIP-15 normalise and namehash; a label that does not hash to an entry's `operator` or `upstream` is dropped.
- [ ] Reader tests: hash mismatch rejected; bad signature rejected; lower version rejected; different maintainer returns a conflict and keeps the pinned list; unverifiable record keeps the last verified version marked stale; zero resolvable writers gives `unavailable`.
- [ ] The default list document for the demo exists: manual writer at weight 255, detector at warn weight, each entry's `snapshotURI` set to its mirror URL.
