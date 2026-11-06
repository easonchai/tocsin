# 03: Reader sync and verification

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Reader library; Testing decisions, parity, lying source, anchors and checkpoints, snapshot source. PRD: `docs/spec/threat-flag-log.md`, Leaf hash and chains; Light-client read procedure steps 1 to 4; Test Cases.

**What to build:** The reader package's sync call, driven through Vitest with in-memory proof source, leaf source, and checkpoint store. Given a proven head and a leaf source, it reproduces the contract's hashes exactly, lands on the proven head, and says `unavailable` with the first diverging sequence when the source lies.

**Blocked by:** None locally. Needs the fixture from log-contract ticket 05 for the parity test; until it exists, the parity test is skipped with a note.

**Ethskills:** tools, indexing, testing (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Pure TypeScript package with the three injected interfaces from the spec; block number per event is a required field of the leaf source.
- [ ] Parity: every leaf hash, writer head, and global head in the Foundry fixture equals the TypeScript recomputation.
- [ ] Lying source: drop one, alter one, append one past the proven sequence, reorder two; each gives `unavailable` for that writer with the first diverging sequence after one rewind and retry, never `clean`.
- [ ] Anchors and checkpoints: first sync from an untrusted anchor lands on the proven head; second sync starts from the checkpoint and fetches only the suffix; checkpoint written only on a finalized block; a mismatch rewinds to the checkpoint.
- [ ] Snapshot source: a leaf source built from a mirror-format file syncs to the proven head; the same file with one leaf dropped gives `unavailable`.
- [ ] Slot formulas from the spec's Storage layout are the only contract-storage knowledge in the package, and the proof request covers only the pinned writers.
