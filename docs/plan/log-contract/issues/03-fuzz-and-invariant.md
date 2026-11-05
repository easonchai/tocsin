# 03: Fuzz and handler invariant

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, fuzz and invariant paragraphs. PRD: `erc/eip-draft_threat_flag_log.md`, Leaf hash and chains.

**What to build:** A property search over the contract that does not depend on hand-picked values. Random leaves and batch sizes go through both entry points, an independent recomputation in the test checks every emitted hash and head, and a handler-driven invariant run proves that replaying the events reproduces the stored heads after arbitrary sequences.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** testing, security (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Fuzz test over random leaves across the full field domains, batch sizes bounded 1 to 500 with `bound()`, random writers. Properties: writer sequence and global sequence increase by exactly one per leaf; every leaf changes both heads; emitted leaf hash, writer head, and global head equal a test-side recomputation from the emitted inputs.
- [x] Invariant with `targetContract` pointing at a handler, never the log. The handler owns funded signing actors, chooses `append` or `appendSigned`, signs valid batches, and bounds inputs to valid ranges.
- [x] Invariant: replaying every emitted `Appended` event per writer from the zero head reproduces the stored writer head at the stored writer sequence, and the same for the global chain.
- [x] `fail_on_revert` on while the handler is built; the final run's calls-to-reverts ratio is recorded in the ticket's Comments and is low enough that sequences reached real states.

## Comments

**2026-11-06.** Done in `test/Fuzz.t.sol`, `test/Invariant.t.sol`, and `test/handlers/LogHandler.sol`. Run settings live in inline `forge-config` comments, so `foundry.toml` is untouched.

`testFuzz_batchChainsEveryLeaf` runs 256 times. Each run picks a batch size with `bound(n, 1, 500)`, a block number up to `type(uint64).max`, and either `append` from a random address or `appendSigned` from a random key relayed by a random sender. The first leaf comes straight from the fuzzer, so edge values like 0 and max reach the log. The rest come from a seed, with zero evidence and zero `refLeaf` mixed back in. One own-writer and one other-writer append run first so both chains start away from zero. The 500-leaf runs cost about 30M gas and the whole test takes under a second.

`invariant_replayReproducesHeads` targets the handler only, restricted to `append`, `appendSigned`, and `roll`. Settings are 64 runs, depth 100, `fail-on-revert = true`. The handler has four `makeAddrAndKey` actors funded with 100 ether, batches of 1 to 10, and a relayer picked from the actors. Final run: 6400 calls, 0 reverts (append 2140, appendSigned 2059, roll 2201). About 21 s.

I checked that the properties can fail on a scratch copy of the contract. Crediting signed batches to `msg.sender` failed both tests. Chaining the global head off the writer head failed both tests too.
