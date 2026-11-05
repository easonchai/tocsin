# 03: Fuzz and handler invariant

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, fuzz and invariant paragraphs. PRD: `erc/eip-draft_threat_flag_log.md`, Leaf hash and chains.

**What to build:** A property search over the contract that does not depend on hand-picked values. Random leaves and batch sizes go through both entry points, an independent recomputation in the test checks every emitted hash and head, and a handler-driven invariant run proves that replaying the events reproduces the stored heads after arbitrary sequences.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Status:** ready-for-agent

- [ ] Fuzz test over random leaves across the full field domains, batch sizes bounded 1 to 500 with `bound()`, random writers. Properties: writer sequence and global sequence increase by exactly one per leaf; every leaf changes both heads; emitted leaf hash, writer head, and global head equal a test-side recomputation from the emitted inputs.
- [ ] Invariant with `targetContract` pointing at a handler, never the log. The handler owns funded signing actors, chooses `append` or `appendSigned`, signs valid batches, and bounds inputs to valid ranges.
- [ ] Invariant: replaying every emitted `Appended` event per writer from the zero head reproduces the stored writer head at the stored writer sequence, and the same for the global chain.
- [ ] `fail_on_revert` on while the handler is built; the final run's calls-to-reverts ratio is recorded in the ticket's Comments and is low enough that sequences reached real states.
