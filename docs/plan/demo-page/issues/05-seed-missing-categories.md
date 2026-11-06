# 05: Seed the categories no list flags yet, and give the funder a row

Spec: `docs/plan/demo-page/spec.md`, Implementation decisions, Seeding gaps. Seeders: the infra package's seed, seed-curators and seed-tokens scripts. Address table: `docs/plan/demo/test-addresses.tsv`.

**What to build:** Every category a send or approve can reach has a flagged subject on at least one trust list. The presenter gets a "poisoning funder" row that warns and shows the Snap's warn-only toggle doing its job. A MALICIOUS_DELEGATE subject exists on tocsin.eth for a future EIP-7702 row.

Today the address table has subjects for categories 1, 3, 5, 6, 7 and 8 only. Categories 2 (POISONING_FUNDER) and 4 (MALICIOUS_DELEGATE) have none. The curator seeder refuses to run against a writer that already has leaves, so this needs an append path rather than a rerun.

**Blocked by:** 02 (the scenario table with every group)

**Ethskills:** indexing, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] An append script, or a flag on the existing seeder, that signs and relays additional leaves for a writer that already has leaves, deriving subjects and evidence the same way as the seeders so labels stay stable.
- [x] `poisoning-funder-1` flagged category 2 by the lanterndao.eth writer. `malicious-delegate-1` flagged category 4 by the tocsin.eth manual writer. Transaction hashes appended to the curators manifest.
- [x] The demo address table gains both rows with expected verdicts: funder warn on a send (warn-only by default policy), delegate "not reachable from a send".
- [x] Mirrors under the static site regenerated so beat three still serves every leaf.
- [x] The scenario table gains a Send ETH row for poisoning-funder-1 (lanterndao.eth, POISONING_FUNDER, warn, note "warn-only category; toggle in Snap policy"). The constants test passes against the updated address table.
- [ ] Rehearsed with the Snap: the funder row warns with the toggle on and blocks at policy 1 with the toggle off. Recorded in Comments.

## Comments

- 2026-11-06, seeded on Sepolia. The append path is `dapp/packages/infra/src/append.ts` (`appendFlags`, tested in `append.test.ts`) with the CLI `src/seed-append.ts`, run as `yarn workspace @tocsin/infra tsx src/seed-append.ts`. Each writer signs and the relayer submits. The log assigns sequence numbers, so the script reads the writer's sequence first and checks it moved by exactly the leaf count, read at the receipt's block. A rerun skips any batch the curators manifest already records. Both list documents trust categories 1 to 127 (bit 0 of `categories` is set for the lanterndao.eth writer and the manual writer), so no list or ENS change.
  - `poisoning-funder-1` = `0xC6c795A123830c94299c35ecDa2539E039D85908`, category 2, lanterndao.eth writer sequence 6 to 7, tx `0x988a1aaf67898b5d65aed3661646fb80a8f1f182e236979051ea682f0af2b11e`.
  - `malicious-delegate-1` = `0x2F360fc5bD5a7FC606a039be9DE33253D11a8748`, category 4, manual writer sequence 26 to 27, tx `0x88a576a1152820f789585028789afecc7b0eda1b03531cf13b363c8657929aa3`. The RPC answered the post-send sequence read from a node that had not seen the block, so the script stopped before writing this record. The record in both manifests was added by hand, and the read now pins the receipt's block.
  - Rehearsed first on an anvil fork of Sepolia. On chain afterwards, each leaf appears exactly once. `yarn eval` over RPC and over the mirror: the funder as a recipient against lanterndao.eth gives `warn`; the delegate as a recipient against tocsin.eth gives `clean` and as a delegate gives `block`.
  - Mirrors regenerated for all four writers in `site/mirror/`: manual 27, detector 25, harborwatch 7, lanterndao 7.
- Still needs a human: the scenario table row (box 5) and the Snap rehearsal (box 6).
