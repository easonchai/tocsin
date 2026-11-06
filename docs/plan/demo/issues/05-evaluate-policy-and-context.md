# 05: Evaluate: policy, context, categories

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Reader library, Evaluate; Testing decisions, policy, category 4 self-check, context. PRD: `docs/spec/threat-flag-log.md`, Reader policy rules 1 to 9; Categories; Test Cases 10 to 12.

**What to build:** The reader's evaluate call: a subject and a context in, a verdict of `clean`, `warn`, `block`, or `unavailable` out, with the leaves, writers, and lists that produced it. The spec's recommended policy with no extensions, one test per rule.

**Blocked by:** 03 (Reader sync and verification), 04 (Trust list documents, signing, and the publish CLI)

**Ethskills:** testing, concepts (per AGENTS.md; load before starting)

**Status:** resolved

- [x] Spec Test Cases 10, 11, and 12, one test each, named after the case number.
- [x] One test per policy rule as listed in the spec's Testing decisions: single writer warns, two independent block, shared operator or upstream count as one, weight 255, same-writer tombstone, foreign tombstone, counter, dispute, safelist cap, noisy category bit, `chainId = 0` in category 3 and in category 8, block range and head pin, missing head pin, OR across lists.
- [x] Category 8: two independent writers give `warn` in the recipient context and `block` in the incoming-sender context.
- [x] Context: the same flagged subject as recipient, spender, delegate, and incoming sender returns the verdict only for the categories that apply, `clean` otherwise.
- [x] Category 4 self-check: own-account code starting with `0xef0100` followed by a flagged delegate yields the delegate's verdict.
- [x] `clean` only when every pinned writer synced; the result names writers, categories, evidence, and lists, never a bare verdict.

## Comments

### 2026-11-06

Built `evaluate` in `dapp/packages/reader/src/evaluate.ts`, exported from `src/index.ts`. Tests are in `test/evaluate.test.ts`, 22 of them. They build state with a new `FakeLog` in `test/fakes.ts`, which appends leaves with real hashes and heads, then run the real `acceptList` on signed documents and the real `sync`. Test Case 12 uses the parity fixture with one ALPHA leaf dropped by the source. `RecordingProofSource` and `stateAt` now take an optional leaf set; the default is still the fixture, so the sync tests are unchanged. Sync and lists behaviour is untouched.

Input shape: `evaluate({ subject, context, ownCode?, sync, lists, safelists, logChainId, chainId? })`. `lists` holds `{ list: VerifiedList, blocking }`, where `list` is `ListOutcome.list`. `chainId` is the chain the subject is used on and defaults to `logChainId`. It is synchronous and makes no fetches. The first call for a `SyncResult` builds an index (by subject, by `refLeaf`, by head) in a `WeakMap`, so later calls on the same sync cost only the subject's leaves. The result carries `findings` (writer, category, evidence, leaf, list, weight, counters), each list's own verdict, `safelistedBy`, `disputes`, `unavailable` writers, and `ownDelegate` when the own code is a 7702 designator.

Context to categories, read off the subject column of the spec's Categories table:

- recipient: 1, 2, 3, 6, 7, 8 (8 counts toward `warn` only)
- spender: 3, 7
- delegate: 4
- incomingSender: 1, 3, 5, 6, 8

Noisy categories (128 to 255) apply in every context once the entry sets their bit, because the writer defines what they mean. Reserved categories 9 to 127 apply nowhere.

Readings I picked where the spec leaves room:

- Weight 0 "counts toward nothing", so a weight-0 writer warns under rule 1 but never counts toward a block. A weight-0 writer's counter is ignored too.
- Rule 7: a writer group drops out of the two-writer count when every one of its live flags on the subject has a `COUNTER` from an independent listed writer with weight above 0. A counter never removes a warning, since rule 5 says de-escalation needs the flagger's tombstone, and it never undoes the weight-255 block, which does not depend on a count.
- Category 8 in the recipient context counts toward `warn` only, even next to a flag in another category. The spec says "alone"; this is the stricter reading and still meets the demo spec's test.
- Independence is transitive. Entries sharing a writer, an operator, or a non-zero upstream fall into one group, and a chain of shared fields joins them.
- An entry's block range and head pin apply to every leaf of that writer, tombstones and counters included. A tombstone after `toBlock` does not clear the flag for that entry.
- Rule 8: `block` or `warn` that some writer reached still wins over an unavailable writer, and `unavailable` names the missing writers so the host can show both. `clean` needs every pinned writer synced. Zero applied entries (no entries, or only entries whose head pin matched nothing) is `unavailable`.
- Rule 9: the own-account check needs exactly 23 bytes, `0xef0100` and 20 address bytes, per EIP-7702. The delegate is evaluated in the delegate context, so only category 4 applies, and the top-level verdict is the worse of the two.
- Disputes come from the subject's own namespace, so `disputes` is filled only when the subject is itself a pinned writer.

Conflict with HANDOFF: HANDOFF says `chainId = 0` only for categories 1, 2, 6. Spec v2.1 and the demo spec's test list add category 8, which HANDOFF predates. I followed both. HANDOFF should be updated to say 1, 2, 6, 8.

I checked that the tests can fail. With the category 8 cap, the counter rule, the same-writer check on tombstones, the safelist cap, or the bit-0 limit to 1..127 removed, at least one test failed each time.
