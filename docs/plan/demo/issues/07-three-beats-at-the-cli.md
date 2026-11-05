# 07: Three beats at the command line: RPC source, lying proxy, mirror

Spec: `docs/plan/demo/spec.md`, Solution, three beats; Implementation decisions, Demo infrastructure, lying proxy and snapshot mirror. PRD: `erc/eip-draft_threat_flag_log.md`, Security Considerations, Data availability. HANDOFF step 3.

**What to build:** A Node command that evaluates an address against the real Sepolia log through a chosen source, so beats one to three are proven before any wallet surface exists. Honest RPC: `block` naming writer, category, evidence. Lying proxy: `unavailable, chain mismatch at sequence N`. Mirror via the entry's `snapshotURI`: `block` returns on the proven head.

**Blocked by:** 05 (Evaluate: policy, context, categories), 06 (Seed the Sepolia log and the relayer)

**Ethskills:** indexing, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-human

- [x] An RPC leaf source over `eth_getLogs` per writer from a checkpoint, with the block number taken from each log's receipt, and a proof source over `eth_getProof` against an RPC header labelled unverified.
- [x] Lying log proxy: forwards every method, drops one `Appended` log of the manual writer from `eth_getLogs` responses.
- [x] Snapshot mirror: one static file per writer in the spec's format (ABI-encoded topics and data plus block number, writer-sequence order), served from the same static host as the list documents, at the URL in the entry's `snapshotURI`.
- [ ] The command run three times with the three sources prints the three verdicts above for the seeded drainer receiver, and the output is pasted into Comments.
- [ ] A seeded category 8 subject evaluated as recipient prints `warn`, not `block`.

## Comments

- 2026-11-06: Built and rehearsed on a local anvil. Boxes 4 and 5 hold on anvil (output below) and get ticked after the same run on Sepolia, which needs a human because the log is not deployed there yet.
  - Files. `dapp/packages/reader/src/rpc.ts`: `rpcLeafSource` over `eth_getLogs`, `rpcProofSource` over `eth_getProof`, and the shared `getAppendedLogs` and `decodeAppended`. It is plain TypeScript over an injected EIP-1193 `request`, so the Snap and wallet hosts can reuse it. `ProvenBlock` in `types.ts` gained an optional `unverified: true`, which the RPC proof source always sets. `dapp/packages/infra/src/`: `lying-proxy.ts` (`yarn lying-proxy`), `mirror.ts` (`yarn mirror`), `evaluate-cli.ts` (`yarn eval`). Tests: `reader/test/rpc.test.ts` decodes an `eth_getLogs` response recorded from this anvil and checks chunking, the anchor lookup, removed and malformed logs, and the proof source's slot order and finalized flag. `infra/src/lying-proxy.test.ts` checks the filter on single and batch responses. `env.ts` now exports `required`.
  - The leaf source filters on the log address and the writer topic. Each leaf's block number is the log's `blockNumber`. It splits the range into chunks of `LOG_BLOCK_RANGE` blocks (default 10,000). For a suffix after sequence `n > 0` it first finds leaf `n` with an exact `writerSeq` topic filter and scans from that leaf's block. A sync from a checkpoint or anchor therefore skips older history without changing the `LeafSource` interface. That lookup is not cached (marked `shortcut:` in the code).
  - The proof source reads `latest`, calls `eth_getProof` at that block number, and sets `finalized` when that block is at or below the RPC's `finalized` tag, or false if the RPC has no such tag. It does not check the storage proofs against `stateRoot`. The header comes from the same RPC, so an RPC that lies can forge a matching proof, and the check would only catch a liar that is inconsistent. The header is labelled unverified, and the CLI prints that on every run. This is the Snap's trust level.
  - The lying proxy forwards every request to `RPC_URL` and changes one thing: in `eth_getLogs` results, it removes the `Appended` log whose topics name `PROXY_DROP_WRITER` (default: the manual writer in the seed manifest) and `PROXY_DROP_SEQ` (default 1, the seeded drainer receiver's flag). It matches batch responses to requests by id and sends CORS headers so a browser or Snap host can use it. It listens on 127.0.0.1 only.
  - The mirror writes `site/mirror/<writer-lowercase>.json` for each writer in the seed manifest, or for the writers given as arguments. Each file is a JSON array of `{blockNumber, topics, data}`, in chain order, which is writer-sequence order. Before writing, it compares the log count with `writerSeq` at the same block and refuses to publish a short snapshot. `publish-list fill` already writes `snapshotURI` as `<TOCSIN_SITE_BASE_URL>/mirror/<writer-lowercase>.json`, so the files land at the entry's URL once `site/` is served.
  - The CLI reads the list document from `site/lists/default.json` (or `LIST_DOCUMENT`) and the record value from `LIST_RECORD`. It runs `acceptList`, so a wrong root or signature stops it. It does not look up ENS. I skipped the "build and sign in memory" option: the rehearsal signed with a throwaway key through `publish-list`, which is the same path the live run takes. Proofs always come from `RPC_URL`. Leaves come from `RPC_URL`, from `PROXY_URL`, or from each entry's `snapshotURI` (http or `file://`). A snapshot that cannot be fetched makes that writer unavailable with the fetch error, not a sequence number. Checkpoints are in memory, so every run syncs from genesis and no earlier run can hide a lie. The default list is applied as blocking.
  - Ethskill conflict: `indexing` says history comes from an indexer and never from a log scan at request time. HANDOFF's settled read path says to sync only the pinned writers' entries from any source, and the ERC names `eth_getLogs` on the writer topic as acceptable. I followed HANDOFF. The scan covers two writers, starts at the anchor, and the mirror is the backfill. No per-subject query goes anywhere.
  - Rehearsal on anvil 1.9.0, port 8549, chain 31337. Deployed with `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8549 --broadcast --private-key <anvil key 0>` at `0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865`. Seeded with the ticket 06 recipe: anvil dev keys 1 and 2 as manual writer and relayer, plus a fresh detector key, all passed as env vars. Result: manual and detector each at `writerSeq` 25, `globalSeq` 50. I filled `default.template.json` with a throwaway maintainer key (`openssl rand`) and set `chainId` to 31337 by hand, because the template hard-codes 11155111. Then I signed it with `publish-list sign <doc> http://127.0.0.1:8551/lists/default.json`, ran `yarn mirror`, served `site/` with `python3 -m http.server 8551 --bind 127.0.0.1 --directory site`, and started `yarn lying-proxy` on 8550. Env for each `eval`: `RPC_URL=http://127.0.0.1:8549 CHAIN_ID=31337 LOG_ADDRESS=0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865 LIST_RECORD=<hex>`. Output:

    ```
    $ yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc
    list     .../site/lists/default.json, record from LIST_RECORD: version 1, maintainer 0xb3B6d2767992D1F7020093D2EaAdd22bE778CF8e, signature checked
    header   block 4 0x2ca6b824460621d64d5ed452dfa78aecc94a7dd76b2df06156e80519da124613, from RPC_URL, unverified (no light-client check), not finalized
    source   RPC_URL over eth_getLogs
    writer   0x70997970C51812dc3A010C7d01b50e0d17dc79C8 synced to sequence 25
    writer   0x60b2aC09cA9429B85e9377ee6173204cf009d8cf synced to sequence 25
    subject  0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 as recipient
    verdict  block
      writer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, category 3 DRAINER_RECEIVER, evidence 0x3799cf06f4ea2b24ffdc4730e89c1dbd7455a4c362da01dac89250cb79e98582, weight 255, sequence 1, block 2

    $ yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source proxy
    list     .../site/lists/default.json, record from LIST_RECORD: version 1, maintainer 0xb3B6d2767992D1F7020093D2EaAdd22bE778CF8e, signature checked
    header   block 4 0x2ca6b824460621d64d5ed452dfa78aecc94a7dd76b2df06156e80519da124613, from RPC_URL, unverified (no light-client check), not finalized
    source   PROXY_URL over eth_getLogs
    writer   0x70997970C51812dc3A010C7d01b50e0d17dc79C8 unavailable, chain mismatch at sequence 1
    writer   0x60b2aC09cA9429B85e9377ee6173204cf009d8cf synced to sequence 25
    subject  0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 as recipient
    verdict  unavailable, chain mismatch at sequence 1 (writer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)

    $ yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source mirror
    list     .../site/lists/default.json, record from LIST_RECORD: version 1, maintainer 0xb3B6d2767992D1F7020093D2EaAdd22bE778CF8e, signature checked
    header   block 4 0x2ca6b824460621d64d5ed452dfa78aecc94a7dd76b2df06156e80519da124613, from RPC_URL, unverified (no light-client check), not finalized
    source   mirror, each entry's snapshotURI
    writer   0x70997970C51812dc3A010C7d01b50e0d17dc79C8 synced to sequence 25
    writer   0x60b2aC09cA9429B85e9377ee6173204cf009d8cf synced to sequence 25
    subject  0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 as recipient
    verdict  block
      writer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, category 3 DRAINER_RECEIVER, evidence 0x3799cf06f4ea2b24ffdc4730e89c1dbd7455a4c362da01dac89250cb79e98582, weight 255, sequence 1, block 2

    $ yarn workspace @tocsin/infra eval 0xCd2698C9c9b2b69625DD2a56252190647F34913d --source rpc --context recipient
    ...same list, header, and writer lines as the rpc run...
    subject  0xCd2698C9c9b2b69625DD2a56252190647F34913d as recipient
    verdict  warn
      writer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, category 8 THEFT_PROCEEDS, evidence 0xf2eb6757f220d2a68a3d9052dc6f34a4afe0aaa3001c12261c4efee4c1bf4626, weight 255, sequence 22, block 2
    ```

    The proxy printed `dropped 1 Appended log(s)` twice per run, once for the first sync attempt and once for the rewind and retry. Other checks: a second proxy with `PROXY_DROP_SEQ=7` gave `chain mismatch at sequence 7`. A curl batch of `eth_blockNumber` plus `eth_getLogs` through the proxy returned both answers, with 24 of the manual writer's 25 logs. With the static server stopped, the mirror run printed `unavailable, source failed: snapshot http://127.0.0.1:8551/mirror/<writer>.json unavailable: fetch failed` for both writers, never `clean`. Afterwards I deleted the filled list, the anvil mirror files, and `seed-manifest.31337.json`, and stopped all four processes.
  - Open: the mirror is a point-in-time file. Once either writer appends a leaf after it is written, that writer's mirror no longer reaches the proven head and shows as unavailable in beat 3. The detector appends on its own schedule, so run `yarn mirror` and redeploy `site/` right before the demo. The drainer verdict still returns `block` while only the detector is stale, because the manual writer's weight 255 decides it, and the CLI then prints `also unavailable: <detector>`. Also: the infra CLIs import `rpc.ts` by relative path (`../../reader/src/rpc.js`) until `@tocsin/reader` exports it.
  - The human runs on Sepolia, after log-contract ticket 06 (deploy), demo ticket 06 (seed), and the list from ticket 04 is filled with the real maintainer and a `TOCSIN_SITE_BASE_URL` that serves `site/`:
    1. In `dapp/packages/infra/.env`, next to the ticket 06 values (`RPC_URL`, `CHAIN_ID=11155111`, `LOG_ADDRESS`), set `LOG_FROM_BLOCK=<deploy block>` (the `blockNumber` of the receipt in `dapp/packages/foundry/broadcast/Deploy.s.sol/11155111/run-latest.json`) and `LIST_RECORD=<hex printed by publish-list sign for site/lists/default.json>`. If the RPC caps `eth_getLogs` spans, set `LOG_BLOCK_RANGE` below the cap.
    2. From `dapp/`:

       ```
       yarn workspace @tocsin/infra test
       yarn workspace @tocsin/infra mirror
       ```

       Commit `site/mirror/*.json` and deploy `site/`, then check that both `snapshotURI` values in `site/lists/default.json` return the files.
    3. In a second terminal, from `dapp/`: `yarn workspace @tocsin/infra lying-proxy`. It should print the manual writer and sequence 1.
    4. From `dapp/`:

       ```
       yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc
       yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source proxy
       yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source mirror
       yarn workspace @tocsin/infra eval 0xCd2698C9c9b2b69625DD2a56252190647F34913d --source rpc --context recipient
       ```

       The seeded subjects come from fixed labels, so these addresses are the same on Sepolia. Check them against `subjects` in `seed-manifest.11155111.json`. Expect `block`, `unavailable, chain mismatch at sequence 1`, `block`, and `warn`. If the manual writer had leaves before the seed, sequence 1 is not the drainer flag, but the proxy beat still shows a mismatch at 1.
    5. Paste the output here and tick boxes 4 and 5.
