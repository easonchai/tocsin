# Scripts: ENSv2 name, seed list, publish

All Sepolia. Fill `scripts/.env` (copy from `.env.example`; it is gitignored) with the owner key, the deployed log address, and an RPC. Install once with `npm install`.

Run in this order:

```
node --env-file=scripts/.env scripts/ens/1-register-tocsin.mjs      # tocsin.eth on ENSv2 Sepolia (test USDC, commit, wait ~75s, register)
node --env-file=scripts/.env scripts/ens/2-setup-core.mjs           # resolver + subregistry + MirrorRegistrar + core.tocsin.eth, then emancipate
node --env-file=scripts/.env scripts/ens/3-claim.mjs <label>        # anyone who owns <label>.eth: claim <label>.tocsin.eth
node --env-file=scripts/.env scripts/ens/4-register-and-claim.mjs <label>   # demo: register <label>.eth with CLAIMER_PRIVATE_KEY, then claim the subname
node --env-file=scripts/.env scripts/ens/5-delegate-publisher.mjs <addr>  # let one hot key set only the list text record on your resolver (--revoke to undo)
node --env-file=scripts/.env scripts/agent/detector.mjs --dry              # the detector agent: scan mainnet for poisoning dust, flag operators, append under its own key
node --env-file=scripts/.env scripts/seed/seed-core.mjs --dry       # resolve evidence blocks, show the batches
node --env-file=scripts/.env scripts/seed/seed-core.mjs             # append 92 leaves to the log (one batch of 100 max per tx)
node --env-file=scripts/.env scripts/seed/publish-list.mjs          # sign the trust list, set the ENS record, write core.list.json
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

`scripts/agent/detector.mjs` is a writer with its own identity: `detector.tocsin.eth`, owned by `DETECTOR_PRIVATE_KEY`. It scans the last N mainnet blocks for zero-value USDT and USDC transfers, groups them by the transaction sender (the account that authorized the dust, never a bundler, per the ERC's category 1 rule), and flags senders that sprayed at least `--min-recipients` addresses as `POISONING_OPERATOR` with the dust transaction as evidence. Candidates go to `docs/plan/demo/seed/detector.json`; with `LOG_ADDRESS` set they are appended under the detector's namespace. A 40-block dry run on 6 Nov 2026 found two live operators, each hitting more than a hundred recipients. Public RPCs refuse unfiltered log scans, so it watches the two stablecoins, which is where poisoning dust lives.

To give it its name: register `detector.eth` and claim `detector.tocsin.eth` with `4-register-and-claim.mjs detector` using the detector key as `CLAIMER_PRIVATE_KEY`. Keep that key in a secret store such as 1Claw and load it into `DETECTOR_PRIVATE_KEY` at run time; the script never writes it anywhere.

## Delegating the publish role

`5-delegate-publisher.mjs <address>` calls `authorizeTextRoles` on your resolver so that one account can set the `erc-threat-flag-log.list` text key and nothing else. The name owner's key stays cold; a CI job or an agent holds the publishing key. `--revoke` takes it back. This is the Enhanced Access Control feature the ENS prize text names: delegating a specific right on a name rather than the name.
