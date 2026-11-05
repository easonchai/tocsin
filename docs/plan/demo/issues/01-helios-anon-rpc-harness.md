# 01: Hour 0 to 6 harness: Helios plus Anon-RPC on Sepolia

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Hour 0 to 6 harness. PRD: `erc/eip-draft_threat_flag_log.md`, Light-client read procedure; Security Considerations, Query privacy. HANDOFF step 1.

**What to build:** One page in the scaffold's Next.js package that opens, syncs Helios on Sepolia, bootstraps the Anon-RPC worker through Helios, routes Helios's execution reads through the worker over Tor, and prints the proven values of the log's storage slots 2 and 3 together with the transport in use. Switching to Nym works; passthrough does not exist. At hour six the team records go or no-go.

**Blocked by:** None (can start immediately). Reads the log's CREATE2 address; before log-contract 06 lands the slots read zero, which is fine.

**Ethskills:** tools, frontend-playbook, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent. One box remains: proving slots 2 and 3 at the log's own address, which needs the log deployed (HANDOFF step 2). Then rerun `/harness` with the default log address and tick it. The hour-6 call is the team's; the recommendation is in Comments.

- [x] Helios 0.12.0 runs in the browser on Sepolia with a pinned weak-subjectivity checkpoint and an editable consensus endpoint.
- [x] The Anon-RPC browser-harness 0.4.0 worker is bootstrapped through Helios and its hash is checked against the light client; a `globalThis.fetch` shim sends Helios's execution RPC URL through the worker.
- [x] Tor specifier by default, Nym selectable; the passthrough specifier is absent from the build and the page shows which transport served the read.
- [ ] The page prints proven values of slots 2 and 3 at the log's address and the header they were proven against.
- [x] Hour-6 go or no-go recorded in this ticket's Comments. If no-go: Helios direct for proofs, worker for logs, ENS, and broadcast, and the fallback copy is written.
- [x] No key, token, or keyed RPC URL in the repo; endpoints come from the environment.

## Comments

### 2026-11-06, harness built and run (agent)

**Where it is.** Page `dapp/packages/nextjs/app/harness/page.tsx` at `/harness`. The reusable part is `dapp/packages/nextjs/utils/harness/anonHelios.ts`, with no React in it: `startHelios`, `bootstrapAnonRpc`, `installFetchShim`, `proveWriterHeads`, `writerSlots`, plus the constants `SPECIFIERS`, `CHECKPOINTS` and `LOG_ADDRESS`. Endpoints come from `NEXT_PUBLIC_HARNESS_*` in `dapp/packages/nextjs/.env.example`, and the page lets you edit each one.

**What "slots 2 and 3" means here.** The ERC's Storage layout makes slots 2 and 3 the roots of the `writerHead` and `writerSeq` mappings. Solidity never writes anything at a mapping root, so the page proves the per-writer entries, `keccak256(abi.encode(w, 2))` and `keccak256(abi.encode(w, 3))`, for each configured writer in one `eth_getProof` (read procedure, step 2). With no writer configured it proves the raw roots 2 and 3, which are always zero.

**Things the ticket did not anticipate.**

1. The Tor and Nym specifiers exist only on mainnet. Both addresses have no code on Sepolia. So the harness runs two light clients: a mainnet Helios that reads `workerHash()` for the worker bootstrap, and a Sepolia Helios for the log. The mainnet one shuts down once the worker is ready.
2. Public Sepolia beacon servers do not keep old bootstraps. Lodestar Sepolia answered `light_client/bootstrap` only for the current finalized root. A root pinned 20 minutes earlier got HTTP 500 "syncCommitteeWitness not available". publicnode's Sepolia beacon API has no light-client endpoints at all. The fix is to pin the bootstrap JSON next to the checkpoint (`utils/harness/bootstrap-{sepolia,mainnet}.json`, about 54 KB each) and answer Helios's bootstrap request from it. Helios checks the bootstrap header against the pinned root, so the file is no weaker than a fetched one. Checkpoints were taken 2026-11-05 20:19 UTC: Sepolia `0xd2a1b88d...` at slot 11514624, mainnet `0xcd84ad57...` at slot 15590400. Refresh both inside two weeks.
3. Sepolia is on Gloas. The light-client header carries only `execution_block_hash`. Helios 0.12 handles that by fetching the block from the execution RPC.
4. Helios 0.12 follows finality updates only. Any `latest` read fails with "out of sync: N seconds behind" when the server's attested header is more than about a minute old. Lodestar's lagged 236 s on mainnet and 306 s on Sepolia while publicnode's mainnet one was 20 s old. So `proveWriterHeads` falls back to `finalized` and the page prints which tag it used. The specifier read always uses `finalized`.
5. Most public RPCs refuse `eth_getProof` at a finalized block (about 70 behind head). publicnode Sepolia, sentio, flashbots and some publicnode mainnet backends run Reth and return "distance to target block exceeds maximum proof window" even 8 blocks back. Tenderly allows a short window. `0xrpc.io/sep` and `0xrpc.io/eth` run Geth and serve finalized proofs, so they are the defaults.
6. Helios rejects the proof for an account that does not exist yet. At `0xC5616bb2...` (not deployed) Geth returns `storageHash` 0x0 with an empty storage proof, and Helios throws "invalid storage proof". So box 4 cannot pass until the log is deployed. To show the proof path works, the page's log address field was pointed at Sepolia WETH (`0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`), where slot 3 is `balanceOf`, so `writerSeq(0xdEaD)` there is WETH's balance of 0xdEaD.
7. The Nym worker drops request headers. 0xrpc.io (Fastify) then answers HTTP 415 "Unsupported Media Type: undefined". That happens whether the host passes a Request, a header list or a header object. Tor does not have this problem. Nym works against RPCs that accept a body with no content-type (publicnode, Tenderly). This should go upstream to `nymtech/anon-rpc-worker`.
8. Helios's wasm fetch parses `response.url`, and a constructed Response leaves it empty ("url parse"). The shim fills it in.

**Runs (Chrome 156 on macOS over a phone hotspot; times are from the page log).**

| Run | Transport, mode | Result |
| --- | --- | --- |
| A | Tor, proofs via worker, cold | Mainnet Helios synced 3.5 s. Tor fast bootstrap timed out dialling the demo gateway; the directory came over circuits, so the worker was ready at 264 s. Its hash `0x5b62f358...` matched the Helios-verified `workerHash()`. Sepolia execution calls then went over Tor: worker log "Fetching https://ethereum-sepolia-rpc.publicnode.com:443 via Tor", "TLS connection established", status 200. Helios then hit finding 4. |
| B | Tor, warm (directory cached in IndexedDB) | Worker ready 11 s after Helios. Sepolia Helios synced 5 s later through Tor. Proof refused by publicnode's Reth (finding 5). |
| C, D, E | Tor, cold or warm | The demo gateway `152.236.3.22:12298` stopped answering: "kps: HELLO timeout" on every relay connection, guards unreachable, no directory after 6 min. |
| F | Nym, proofs via worker, Tenderly RPC | Worker ready 42 s after mainnet sync, hash `0xf13a448a...` matched. Sepolia Helios synced through the mixnet in 126 s. Proved both slots at finalized block 12071950 (`0x31bed973...`) with 4 execution requests, all through the Nym worker. |
| G | Fallback, proofs direct, Tor | Sepolia Helios synced in 3 s and proved both slots directly at block 12071886. The Tor worker then failed to bootstrap (gateway as in C). |
| H | Fallback, proofs direct, Nym, 0xrpc.io | Proofs direct at block 12072017. `eth_getLogs` through Nym got 415 (finding 7). |

Run I was the last one: Tor, proofs via worker, Tenderly, cold. The worker was ready at 239 s, with the directory over circuits and the hash matching. Then every execution call failed with "Failed to obtain exit circuit ... Tried to find or build a tunnel 9 times", with guards unreachable through the gateway. Helios gave up at 300 s with "failed to resolve initial finalized block: error sending request". In short, Tor got a worker up in 3 of 5 tries, carried RPC traffic once, and never completed a proof.

**Go or no-go recommendation (the team decides at hour 6).** Go on the architecture, no-go on the public Tor gateway as the stage transport. The evidence:

- Helios in the browser works. Mainnet syncs in 2 to 6 s from the pinned bootstrap and Sepolia in 3 to 5 s direct.
- The bootstrap works on both specifiers: the light client verifies the worker hash.
- The shim works: Helios's execution traffic went over both Tor and Nym.
- A complete light-client-verified, anonymised proof landed over Nym.
- Over Tor we only reached the RPC once. The demo gateway, which says of itself "limited capacity, may disappear at any time", failed most cold starts from this network.

What I recommend before the demo:

1. Run our own `tor-js-gateway` (`ethereum/tor-js`, `crates/tor-js-gateway`) and set `NEXT_PUBLIC_HARNESS_TOR_GATEWAYS` to it.
2. Warm the Tor directory cache before going on stage.
3. Keep Nym, with a content-type-tolerant RPC, as the live switch.
4. Keep the fallback checkbox as the last resort.

**Fallback as built.** "Fallback: proofs direct" skips the shim. Sepolia Helios talks to the execution RPC itself and still verifies every proof. Then the worker carries an `eth_getLogs` over the last 1000 blocks to show the log path. The page copy reads: "Fallback mode. Storage proofs go straight to the Sepolia execution RPC. Helios still verifies them, but that server sees your IP address and which log you read. Log reads go through the worker and are anonymised, and so will ENS and broadcast." The default mode's copy says the consensus RPC and the mainnet bootstrap RPCs are contacted directly and learn only that a light client runs and which worker it loads.

**Conflict with the ticket and spec wording.** "Bootstrapped through Helios on Sepolia" cannot hold as written because the specifiers are mainnet-only, so the bootstrap uses a mainnet Helios. HANDOFF does not settle which chain the bootstrap reads, so nothing in HANDOFF is overridden.
