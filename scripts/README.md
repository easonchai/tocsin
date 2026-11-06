# Scripts: ENSv2 name, seed list, publish

All Sepolia. Fill `scripts/.env` (copy from `.env.example`; it is gitignored) with the owner key, the deployed log address, and an RPC. Install once with `npm install`.

Run in this order:

```
node --env-file=scripts/.env scripts/ens/1-register-tocsin.mjs      # tocsin.eth on ENSv2 Sepolia (test USDC, commit, wait ~75s, register)
node --env-file=scripts/.env scripts/ens/2-setup-core.mjs           # resolver + subregistry + MirrorRegistrar + core.tocsin.eth, then emancipate
node --env-file=scripts/.env scripts/ens/3-claim.mjs <label>        # anyone who owns <label>.eth: claim <label>.tocsin.eth
node --env-file=scripts/.env scripts/ens/4-register-and-claim.mjs <label>   # demo: register <label>.eth with CLAIMER_PRIVATE_KEY, then claim the subname
node --env-file=scripts/.env scripts/ens/5-delegate-publisher.mjs <addr>  # let one hot key set only the list text record on your resolver (--revoke to undo)
node --env-file=scripts/.env scripts/agent/detector.mjs --dry              # the detector agent template: flag sample operators (or --source live) under its own key
node --env-file=scripts/.env scripts/seed/seed-core.mjs --dry       # resolve evidence blocks, show the batches
node --env-file=scripts/.env scripts/seed/seed-core.mjs             # append 92 leaves to the log (one batch of 100 max per tx)
node --env-file=scripts/.env scripts/seed/publish-list.mjs          # sign core's trust list, set the tocsin.list record, write core.list.json
git add docs/plan/demo/seed && git commit -m "Seed: core list on Sepolia"   # so LIST_URI serves the signed document
```

What each one leaves behind:

- `scripts/ens/state.sepolia.json`: resolver proxy, subregistry proxy, registrar, the list name's node, and whether the registry is emancipated. Commit it.
- `docs/plan/demo/seed/core.seed.json`: the entries with `seenBlock` filled from each evidence tx.
- `docs/plan/demo/seed/core.receipts.json`: the append tx hashes and which keys each batch carried. Re-runs skip these.
- `docs/plan/demo/seed/core.list.json`: the signed `TrustList` document, its root, signature, and the exact record value.

ENSv2 facts the scripts rely on, checked against the contracts-v2 Sepolia deployment on 6 Nov 2026:

- `.eth` registration goes through the ENSv2 `ETHRegistrar` and is paid in test USDC, which the `MockUSDC` contract mints freely. Commit, wait `MIN_COMMITMENT_AGE`, register.
- Subnames live in the parent name's own registry, a `UserRegistry` proxy deployed through the `VerifiableFactory`, and the parent points at it with `setSubregistry`. There is no shared registry to write into.
- Records live in a per-account `PermissionedResolver` proxy, also from the factory. The deployed Sepolia implementation takes `bytes32 node` in its setters.
- Permissions are Enhanced Access Control role bitmaps. `common.mjs` composes them; the publish role for the list record is `ROLE_SET_TEXT`, which the maintainer holds on the resolver's root resource.

Gas: a 92-leaf `append` is around one million gas. Fund the writer with a little Sepolia ETH from a faucet.

The reader side (verifying the record through state, replaying the leaves to the proven head) is in the demo spec, ticket 04 and 08, not here.

## The hub and the MirrorRegistrar

`2-setup-core.mjs` ends by revoking every root role the owner holds on the tocsin.eth subregistry, including its own registrar role. After that only `MirrorRegistrar` can mint, and nobody can change a claimed name's resolver, unregister it, transfer it, or upgrade the registry. The script prints `emancipated: true` when `hasAssignees(ROOT_RESOURCE, dangerousRoles)` is false. Pass `--keep-roles` to skip that step while testing. It is irreversible once run.

The registrar rule: `claim(label, resolver)` succeeds only when `ETHRegistry.findOwner(label)` is the caller. The subname's expiry copies the `.eth` name's, and anyone can call `sync(label)` after a renewal. Spec: `docs/plan/demo/issues/15-mirror-registrar.md`. Tests: `forge test --root scripts/ens --fork-url $SEPOLIA_RPC --fork-block-number <recent>`; pin the block, the public RPC is load balanced and a bare `latest` fork can hit a node that has not seen it.

Rebuild the committed artifact after editing the contract: `forge build --root scripts/ens`, then copy `abi` and `bytecode.object` from `scripts/ens/out/MirrorRegistrar.sol/MirrorRegistrar.json` into `scripts/ens/MirrorRegistrar.json`.

## The detector agent

`scripts/agent/detector.mjs` is a template for an automated writer, not a product: an agent with its own identity, `detector.tocsin.eth`, owned by `DETECTOR_PRIVATE_KEY`, that finds candidates, attaches on-chain evidence, appends them under its own key, and publishes its own list. Replace `findCandidates()` with your detection and keep the rest. By default it uses `--source sample`, five poisoning operators from the verified seed, so the demo is deterministic. `--source live` is the example detection: senders that sprayed zero-value USDT or USDC transfers to at least `--min-recipients` addresses in the last `--blocks` mainnet blocks, flagged as `POISONING_OPERATOR` with the dust transaction as evidence. A 40-block run on 6 Nov 2026 found two real sprayers, and it would also flag a legitimate batch sender, which is why it is not the default and why the detector sits at warn weight in core's list. Output goes to `docs/plan/demo/seed/detector.json`.

To give it its name: register `detector.eth` and claim `detector.tocsin.eth` with `4-register-and-claim.mjs detector` using the detector key as `CLAIMER_PRIVATE_KEY`. Keep that key in a secret store such as 1Claw and load it into `DETECTOR_PRIVATE_KEY` at run time; the script never writes it anywhere.

## Delegating the publish role

`5-delegate-publisher.mjs <address>` calls `authorizeTextRoles` on your resolver so that one account can set the `tocsin.list` text key and nothing else. The name owner's key stays cold; a CI job or an agent holds the publishing key. `--revoke` takes it back. This is the Enhanced Access Control feature the ENS prize text names: delegating a specific right on a name rather than the name.

## Two lists, two writers: the full demo sequence

The detector gets its own name and publishes a self-list; then `core` republishes naming both writers, the detector at warn weight. Readers following `core.tocsin.eth` then see two writers; readers following `detector.tocsin.eth` see one.

```
# 1. the detector's name. CLAIMER_PRIVATE_KEY = the detector key for this step
node --env-file=scripts/.env scripts/ens/4-register-and-claim.mjs detector
# 2. the detector scans mainnet and appends a few flags under its own key
node --env-file=scripts/.env scripts/agent/detector.mjs --limit 5
# 3. the detector publishes its self-list on detector.tocsin.eth
node --env-file=scripts/.env scripts/seed/publish-list.mjs --name detector --key-env DETECTOR_PRIVATE_KEY
# 4. core seeds its 92 leaves and publishes a list naming both writers
node --env-file=scripts/.env scripts/seed/seed-core.mjs
node --env-file=scripts/.env scripts/seed/publish-list.mjs --writers core,detector --warn detector
# 5. commit the documents the list URIs point at
git add docs/plan/demo/seed scripts/ens/claims.sepolia.json && git commit -m "Lists: detector self-list, core names both writers" && git push
```

`publish-list.mjs` resolves labels to keys through `scripts/ens/claims.sepolia.json`, which `3-claim.mjs` writes. Both of our writers declare the same operator, `tocsin.eth`, so a reader never counts them as independent; that is honest, and it is what the `operator` field is for. A standalone detector machine needs only `scripts/.env.detector.example`.

The record key is `tocsin.list` for now. The ERC draft calls it `erc-threat-flag-log.list`, becoming `erc-N.list` once numbered. Any string works; the reader just has to use the same one.
