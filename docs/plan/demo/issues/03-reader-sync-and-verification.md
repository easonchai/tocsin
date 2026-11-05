# 03: Reader sync and verification

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Reader library; Testing decisions, parity, lying source, anchors and checkpoints, snapshot source. PRD: `erc/eip-draft_threat_flag_log.md`, Leaf hash and chains; Light-client read procedure steps 1 to 4; Test Cases.

**What to build:** The reader package's sync call, driven through Vitest with in-memory proof source, leaf source, and checkpoint store. Given a proven head and a leaf source, it reproduces the contract's hashes exactly, lands on the proven head, and says `unavailable` with the first diverging sequence when the source lies.

**Blocked by:** None locally. Needs the fixture from log-contract ticket 05 for the parity test; until it exists, the parity test is skipped with a note.

**Ethskills:** tools, indexing, testing (per AGENTS.md; load before starting)

**Status:** resolved

- [x] Pure TypeScript package with the three injected interfaces from the spec; block number per event is a required field of the leaf source.
- [x] Parity: every leaf hash, writer head, and global head in the Foundry fixture equals the TypeScript recomputation.
- [x] Lying source: drop one, alter one, append one past the proven sequence, reorder two; each gives `unavailable` for that writer with the first diverging sequence after one rewind and retry, never `clean`.
- [x] Anchors and checkpoints: first sync from an untrusted anchor lands on the proven head; second sync starts from the checkpoint and fetches only the suffix; checkpoint written only on a finalized block; a mismatch rewinds to the checkpoint.
- [x] Snapshot source: a leaf source built from a mirror-format file syncs to the proven head; the same file with one leaf dropped gives `unavailable`.
- [x] Slot formulas from the ERC's Storage layout are the only contract-storage knowledge in the package, and the proof request covers only the pinned writers.

## Comments

- 2026-11-06: Done. `sync()` in `dapp/packages/reader/src/sync.ts` makes one proof request for the deduplicated pinned writers (slots from `src/chain.ts`, the only storage knowledge), fetches each writer's suffix up to the proven block, recomputes with viem `encodeAbiParameters` over the ERC's tuples, rewinds to the last finalized checkpoint (or genesis when there is none) and retries once, then returns `unavailable` with `divergedAt`. It returns per-writer state keyed by checksummed address: `synced` with verified leaves, proven seq and head, or `unavailable` with `divergedAt` or the source's `error`. Checkpoints are stored per writer under `<log>:<writer>` and only on finalized blocks, and they carry the verified leaves so a second sync can return the full set while fetching only the suffix. Files: `src/types.ts`, `src/chain.ts`, `src/sync.ts`, `src/sources.ts` (in-memory and snapshot leaf sources, with the mirror format in a doc comment), `src/index.ts`, `test/fakes.ts`, `test/sync.test.ts`. 14 tests, all through `sync()`; the parity test loads `foundry/fixtures/parity.json` and blanks the source's claimed hashes so every match comes from recomputation. Slot values are checked against `cast index` output.
- Mirror format: one JSON file per writer, an array of `{ blockNumber: "<decimal>", topics, data }` in writer-sequence order, where `topics` and `data` are the raw `eth_getLogs` fields. Tickets 07 and the mirror should write exactly that.
- Surprising: the ERC says leaves past the proven `writerSeq` MUST be dropped, while this ticket wants "append one past the proven sequence" to give `unavailable`. Sync drops leaves whose block is past the proven block (the `toBlock` bound). A leaf past the proven sequence at or before the proven block cannot exist on chain, so sync treats it as a lie and reports `unavailable`. That is stricter than the ERC and never less safe. Worth one line in the ERC.
- Only the final head is proven, so an altered leaf is located by comparing each recomputed head with the head the source's own event claims. A source that recomputes its claimed heads after a lie still gets `unavailable`, but `divergedAt` then falls back to the first sequence after the anchor.
