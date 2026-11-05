# 04: Storage layout, ERC-165, gas snapshot, slither

Spec: `docs/plan/log-contract/spec.md`, Testing decisions, storage, ERC-165, gas, and slither lines. PRD: `erc/eip-draft_threat_flag_log.md`, Storage layout and ERC-165 sections; HANDOFF, Gas.

**What to build:** The checks a reader and a reviewer rely on without reading the contract. Raw storage reads prove the normative slot formulas, the ERC-165 answer is pinned, the gas figure the README quotes is reproducible from a snapshot, and static analysis is clean.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** testing, security, gas (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] `vm.load` at slots 0 and 1 and at the ERC's two mapping formulas for two different writers, plus the nonce mapping at slot 4, each matching the value the getters return after appends.
- [x] ERC-165 returns true for the log interface id, true for the ERC-165 id, false for a random id.
- [x] A hundred-leaf batch recorded with Foundry's gas snapshot and committed, so the README's per-flag figure can be re-derived.
- [x] Slither runs on the package with no high or medium finding left unaddressed; any accepted finding is explained in the ticket's Comments.

## Comments

**2026-11-06.** Done in `test/StorageAndInterface.t.sol` and `test/Gas.t.sol`. The snapshot is `snapshots/ThreatFlagLog.json`. The contract source is unchanged.

Storage. Two writers append by signature and one also appends directly. Slots 0 and 1, `keccak256(abi.encode(w, uint256(2)))`, `keccak256(abi.encode(w, uint256(3)))`, and `keccak256(abi.encode(w, uint256(4)))` each equal the getter for both writers. The test also checks fixed counts (global seq 5, writer seqs 3 and 2, nonces 2 and 1), so it does not only compare storage with its own getter. Two checks go beyond case 9. The high 24 bytes of slot 1 are zero, as the ERC states. The root slots 2 to 4 and every derived slot of a writer that never appended read zero.

ERC-165. `type(IThreatFlagLog).interfaceId` is pinned to `0xffc90efa`, the value the contract comment and the ERC reference state. `supportsInterface` returns true for it and for `0x01ffc9a7`, and false for `0xffffffff`. A fuzz test over random `bytes4`, minus the two valid ids, returns false.

Gas. `vm.snapshotGasLastFrame` records three values. Each runs on a fresh log with a fresh writer, so all four storage writes go from zero to non-zero. That is the worst case.

| Snapshot | Gas | Per flag |
| --- | --- | --- |
| `append_1_leaf` | 119,815 | 119,815 |
| `append_100_leaves` | 986,455 | 9,865 |
| `appendSigned_100_leaves` | 1,131,680 | 11,317 |

The snapshot value is already the full transaction gas. I checked by sending the same 100-leaf calldata (22,468 bytes, built with `cast calldata`) to a freshly deployed contract on anvil (forge 1.9.0, hardfork Bpo1) from a fresh sender. The receipt `gasUsed` was 986,455, the same number. The 1-leaf transaction matched too, at 119,815. So the 21,000 base and the calldata are inside the snapshot, and adding them again would count them twice. Split for the 100-leaf `append`: 21,000 base, 136,528 calldata (16 per non-zero byte, 4 per zero byte), 828,927 execution. The EIP-7623 calldata floor does not apply, because execution gas is far above it. A writer's second batch skips the zero to non-zero storage writes. `cast estimate` for that case gave 918,055, which is 9,181 a flag. `test_gas_*` print the split with `-vv`.

Dollars, from live reads at mainnet block 26,350,755. `cast gas-price` returned 317,139,650 wei (0.317 gwei). Chainlink ETH/USD `latestRoundData` returned $2,257.32. At those prices one flag costs $0.0071 in a first batch and $0.0066 in later batches. A signed flag costs $0.0081. That is closer to 0.7 cents than to HANDOFF's "about half a cent". HANDOFF's figure was this week's median gas price and mine is a single spot read, so the README should state which price it uses. The gas figure itself agrees with HANDOFF's "about 10,000 gas per flag".

Slither 0.11.6, run from `dapp/packages/foundry` as `uvx --from slither-analyzer slither . --compile-force-framework foundry --filter-paths "lib|test|script"`. 102 detectors, 7 results, none high or medium. Warning: slither runs `forge clean` and then a forced build first, so it wipes `out/` and `cache/` for anyone else using the tree. The results, each accepted:

- `timestamp` (low): `block.timestamp <= deadline` in `appendSigned`. The ERC requires the deadline check. A proposer can move the timestamp by a few seconds, which at most lets a signature through slightly early or late. That costs the writer nothing.
- `assembly` (informational): the two blocks in `_append` save and restore the free memory pointer, so a large batch does not pay growing memory cost. Both are marked `memory-safe` and touch only `0x40`.
- `low-level-calls` (informational): the ERC-1271 `staticcall` in `_isValidSignature`. The call can change no state, and the return value is checked for success, a 32-byte length, and the magic value. A reverting wallet returns false. The boundary tests cover it.
- `naming-convention` (informational, 4 results): `DOMAIN_SEPARATOR`, `INITIAL_CHAIN_ID`, `INITIAL_DOMAIN_SEPARATOR`. `DOMAIN_SEPARATOR()` is the EIP-2612 convention. The names come from the ERC reference, which must stay byte-identical.

Ethskills applied. From testing: pin values rather than only check storage against getters, fuzz the "false for any other id" claim, and run slither. From gas: fetch gas price and ETH/USD live (Chainlink feed `0x5f4e...8419`), convert wei to gwei and check it, and measure a real transaction instead of guessing gas. From security: explain every static analysis result, and check that the ERC-1271 return value is validated before accepting the low-level call. No conflict with HANDOFF other than the dollar figure above.
