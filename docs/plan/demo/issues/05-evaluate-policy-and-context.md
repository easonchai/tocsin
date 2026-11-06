# 05: Evaluate: policy, context, categories

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Reader library, Evaluate; Testing decisions, policy, category 4 self-check, context. PRD: `docs/spec/threat-flag-log.md`, Reader policy rules 1 to 9; Categories; Test Cases 10 to 12.

**What to build:** The reader's evaluate call: a subject and a context in, a verdict of `clean`, `warn`, `block`, or `unavailable` out, with the leaves, writers, and lists that produced it. The spec's recommended policy with no extensions, one test per rule.

**Blocked by:** 03 (Reader sync and verification), 04 (Trust list documents, signing, and the publish CLI)

**Ethskills:** testing, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Spec Test Cases 10, 11, and 12, one test each, named after the case number.
- [ ] One test per policy rule as listed in the spec's Testing decisions: single writer warns, two independent block, shared operator or upstream count as one, weight 255, same-writer tombstone, foreign tombstone, counter, dispute, safelist cap, noisy category bit, `chainId = 0` in category 3 and in category 8, block range and head pin, missing head pin, OR across lists.
- [ ] Category 8: two independent writers give `warn` in the recipient context and `block` in the incoming-sender context.
- [ ] Context: the same flagged subject as recipient, spender, delegate, and incoming sender returns the verdict only for the categories that apply, `clean` otherwise.
- [ ] Category 4 self-check: own-account code starting with `0xef0100` followed by a flagged delegate yields the delegate's verdict.
- [ ] `clean` only when every pinned writer synced; the result names writers, categories, evidence, and lists, never a bare verdict.
