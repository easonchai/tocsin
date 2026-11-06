# 07: Three beats at the command line: RPC source, lying proxy, mirror

Spec: `docs/plan/demo/spec.md`, Solution, three beats; Implementation decisions, Demo infrastructure, lying proxy and snapshot mirror. PRD: `docs/spec/threat-flag-log.md`, Security Considerations, Data availability. HANDOFF step 3.

**What to build:** A Node command that evaluates an address against the real Sepolia log through a chosen source, so beats one to three are proven before any wallet surface exists. Honest RPC: `block` naming writer, category, evidence. Lying proxy: `unavailable, chain mismatch at sequence N`. Mirror via the entry's `snapshotURI`: `block` returns on the proven head.

**Blocked by:** 05 (Evaluate: policy, context, categories), 06 (Seed the Sepolia log and the relayer)

**Ethskills:** indexing, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] An RPC leaf source over `eth_getLogs` per writer from a checkpoint, with the block number taken from each log's receipt, and a proof source over `eth_getProof` against an RPC header labelled unverified.
- [ ] Lying log proxy: forwards every method, drops one `Appended` log of the manual writer from `eth_getLogs` responses.
- [ ] Snapshot mirror: one static file per writer in the spec's format (ABI-encoded topics and data plus block number, writer-sequence order), served from the same static host as the list documents, at the URL in the entry's `snapshotURI`.
- [ ] The command run three times with the three sources prints the three verdicts above for the seeded drainer receiver, and the output is pasted into Comments.
- [ ] A seeded category 8 subject evaluated as recipient prints `warn`, not `block`.
