# 09: Detector

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Demo infrastructure, detector and relayer. PRD: `erc/eip-draft_threat_flag_log.md`, Categories, category 1 and the forged-evidence bullet. HANDOFF step 5.

**What to build:** A Node process watches new Sepolia blocks, spots dust transfers to lookalike addresses, and within the hour the log carries category 1 leaves from the detector key with the dust transaction as evidence, submitted by the relayer. The detector key never holds ETH.

**Blocked by:** 06 (Seed the Sepolia log and the relayer)

**Ethskills:** indexing, wallets, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-human

- [x] Watches new blocks for sub-threshold value transfers to addresses whose prefix and suffix match a recent counterparty of the receiver; resolves the authorizer (UserOperation sender when the target is an EntryPoint), never the bundler.
- [x] Batches category 1 leaves with the dust transaction hash as evidence, signs `Append` with a one-hour deadline and the current nonce, hands the batch to the relayer. Fixed leaves-per-hour cap.
- [x] The subject's role is established by a transaction the subject authorized or a transfer from it, never from an event's `from` or `to` field alone.
- [ ] Runs from a fresh clone with only the env file; the detector key comes from that file and holds no ETH.
- [ ] One relayed batch from a live run is visible on the explorer with its hash recorded in Comments, and the reader from ticket 07 evaluates one of its subjects as `warn` under the default list.

## Comments

- 2026-11-06: Built and rehearsed on a local anvil. Nothing has run against Sepolia yet. Boxes 4 and 5 wait on the live run below, and box 5 also waits on ticket 07.
  - Files, all in `dapp/packages/infra`: `src/detector.ts` (the pure logic: lookalike match, authorizer resolution, transfer extraction, the bounded counterparty memory, the scan, leaf building, the batcher with cap and dedupe), `src/detect-cli.ts` (`yarn detect`, the block loop, signing, the in-process `relay()` call), `src/detector.test.ts` (25 Vitest cases, no chain), the `detect` script in `package.json`, and the optional `DETECTOR_*` variables in `.env.example`. `relayer.ts`, `batch.ts`, and `env.ts` are unchanged.
  - What it detects. Every poll (4 s) it reads each new block with its transactions plus one `eth_getLogs` for that block filtered to `Transfer`, `UserOperationEvent`, and `BeforeExecution`. A native transfer counts when the transaction has value; an ERC-20 transfer counts per `Transfer` log (ERC-721 logs fail strict decoding and drop out). A transfer the payer authorized and that is not dust records the payee as a recent counterparty of the payer. Dust is native value above 0 and below `DETECTOR_DUST_WEI`, or a token amount below `DETECTOR_DUST_TOKEN_UNITS` raw units, zero included. Dust from L to R is flagged when L matches the first `DETECTOR_PREFIX_HEX` and last `DETECTOR_SUFFIX_HEX` hex characters of an address R recently paid and is not that address. The memory keeps 8 payees for each of 50,000 accounts and evicts the least recently touched account.
  - Role signal, written at the top of `detector.ts`. The subject is always the account that authorized the transaction: `tx.from`, or inside an ERC-4337 bundle the `sender` of a `UserOperationEvent` whose log address is one of EntryPoint v0.6, v0.7 or v0.8 (all three hold code on Sepolia, checked 2026-11-06). A Transfer event's `from` and `to` only say which address was planted in whose history. They never become the subject. Counterparty history also needs the transfer's `from` to equal its authorizer, so a contract that emits fake Transfer events cannot plant a counterparty either.
  - Bundles. A transaction is a bundle when it targets an EntryPoint or carries a `UserOperationEvent` from one. The bundler (`tx.from`) is never returned. A log belongs to the first `UserOperationEvent` after it, and only if it comes after `BeforeExecution`. Validation-phase logs, logs after the last op, and the top-level value sent to the EntryPoint stay unresolved and are skipped.
  - Leaves are category 1 `FLAG`s with the dust transaction hash as `evidence`, the dust block as `seenBlock`, and `refLeaf` zero. `chainId` is 0 when the subject signed the transaction, which makes it an EOA (HANDOFF allows 0 for category 1). A UserOperation sender is a contract account, so its leaf carries this chain's id.
  - Batching. A detection is queued unless this writer already flagged the subject in this process (`duplicate`) or the trailing hour already holds `DETECTOR_LEAVES_PER_HOUR` accepted leaves, default 50 (`capped`). Every `DETECTOR_FLUSH_SECONDS`, default 300, the queue is signed as one `Append` with deadline = latest block timestamp + 3600 and nonce = the current `signatureNonce`, then passed to `relay()`. A dropped batch releases its subjects so they can be flagged again. The cap is not refunded.
  - The detector key only calls `signTypedData`. No wallet client is built for it, so it cannot send a transaction. At start it prints its balance and warns if it is above zero. It refuses to start if the detector and relayer keys are the same.
  - Rehearsal on anvil 1.9.0, port 8547, chain 31337. Deployed with `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key <anvil key 0>`, log at `0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14`. The detector key was a fresh random key, the relayer was anvil key 2, both passed as env vars at run time from a scratch file that was deleted after. `DETECTOR_FLUSH_SECONDS=5`, everything else at defaults (4 and 4 hex). Scenario and results:
    - History: victim (anvil 3, `0x90F7...b906`) paid 1 ETH to counterparty (anvil 4, `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`), block 2.
    - Negatives, no detection: 1000 wei to the victim from an unrelated account (block 3) and from the real counterparty (block 4).
    - Native dust: `anvil_setBalance` and `anvil_impersonateAccount` on the crafted lookalike `0x15D3DEAD00000000000000000000000000006A65` (same first and last 4 hex as the counterparty), which sent 1000 wei to the victim in `0x7f743fcdcce1713f60432377d12e5778d2ba087d737c54174f9de80af0d29919`, block 6. Detector: `queued`, via `tx`. The same dust again in block 7: `duplicate`.
    - Fake-token dust: anvil 6 (`0x976EA74026E726554dB657fA54763abd0C3a0aa9`) deployed a 51-byte contract that emits `Transfer(from, to, value)` from calldata, then made it emit `Transfer(0x15D3bEef00000000000000000000000000006A65, victim, 0)` in `0x2419c009ab3a8c86e7b98d51f4d00cf4084130ca3be34573537e46c33a16c5c6`, block 9. Detector: `queued` with subject anvil 6, the signer, not the event's `from`.
    - Relayed: `0x0e7b9eebd61c146bc83f8faaaf1f4be47ddfd92840cb0099c57decc75d45e847`, block 10, 163,390 gas, sent by the relayer `0x3C44...93BC`. Decoded calldata: writer `0xd0CeBf4ce14C568661D55923A5dE4b56AC3c91FB` (the detector), two leaves `(chainId 0, 0x15D3DEAD...6A65, category 1, op 0, evidence 0x7f74...9919, seenBlock 6)` and `(chainId 0, 0x976E...0aa9, category 1, op 0, evidence 0x2419...c5c6, seenBlock 9)`, nonce 0, deadline 1793913136 against a signing-time block timestamp of 1793909536 (3600 s).
    - After: two `Appended` logs with the detector as the writer topic, `writerSeq` 2, `signatureNonce` 1, detector balance 0 and transaction count 0. Anvil and the detector were stopped.
  - Not rehearsed: a real ERC-4337 bundle (no EntryPoint on the local chain). The attribution rules are covered by six unit cases, including a multi-op bundle, a wrapper contract, a fake `UserOperationEvent` from a non-EntryPoint, and validation-phase logs.
  - Open:
    - Native value moved inside a UserOperation or any internal call needs traces and is not seen.
    - A relayer or meta-transaction forwarder other than a 4337 EntryPoint is not recognised, so for a token Transfer it emits, the forwarder would be the subject. The ERC says never a relayer. Recognise known forwarders if the live run shows any.
    - The token dust threshold is one raw-unit number for every token, whatever its decimals.
    - Dedupe is in memory only. A restart can flag a subject this writer already flagged, which the cap bounds.
    - No reorg handling. A block replaced after processing can leave a leaf whose evidence transaction was dropped.
    - If signing or the RPC fails after the queue is taken and before the relayer sends, those detections are lost and their subjects stay marked flagged.
    - The ticket's first box says "to addresses whose prefix and suffix match". The detector checks the sender side (dust from a lookalike), which is how a lookalike lands in the victim's history. The zero-value `transferFrom(victim, lookalike, 0)` variant, with the lookalike on the receiving side, is not detected.
    - Ticket 07's reader must accept `chainId = 0` on category 1 as applying on Sepolia for the box 5 check to pass.
  - The human runs, after ticket 06's live seed, from `dapp/`:
    1. `dapp/packages/infra/.env` already holds `RPC_URL` (Sepolia), `CHAIN_ID=11155111`, `LOG_ADDRESS`, `DETECTOR_PRIVATE_KEY` (the unfunded detector from 06), and `RELAYER_PRIVATE_KEY` (funded). Grinding a lookalike with 4 and 4 hex takes about 2^32 tries, so for the demo add `DETECTOR_PREFIX_HEX=3` and `DETECTOR_SUFFIX_HEX=3` to that file.
    2. `yarn workspace @tocsin/infra test`, then in its own terminal `yarn workspace @tocsin/infra detect`. Check the printed chain 11155111, log, detector address, and that no balance warning appears. Leave it running.
    3. Pick a victim `V` (the demo account) and a counterparty `C` (any address you control, for example the manual writer). In another shell with `RPC_URL` exported:

       ```
       cast send --private-key <V key> <C> --value 0.001ether --rpc-url $RPC_URL
       cast wallet vanity --starts-with <hex chars 1-3 of C, no 0x> --ends-with <last 3 hex chars of C>
       cast send --private-key <manual writer key> <L address from vanity> --value 0.001ether --rpc-url $RPC_URL
       cast send --private-key <L key from vanity> <V> --value 1000wei --rpc-url $RPC_URL
       ```

       Pass the characters in lowercase hex. The detector compares in lowercase too. The L key is a throwaway. Keep it out of the repo and any chat.
    4. Within 5 minutes the detector prints `queued <L> (tx) dust <hash>` and then `relayed 1 leaves in <relay tx hash>`. Open `https://sepolia.etherscan.io/tx/<relay tx hash>#eventlog`, confirm one `Appended` event with the detector as writer, subject L, category 1, and evidence equal to the dust hash. Record both hashes here and tick box 4. Stop the detector with Ctrl-C.
    5. After ticket 07 lands, evaluate L as recipient with its CLI under the default list and confirm `warn`. Record the output here and tick box 5.
