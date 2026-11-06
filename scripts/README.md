# Scripts: ENSv2 name, seed list, publish

All Sepolia. Fill `scripts/.env` (copy from `.env.example`; it is gitignored) with the owner key, the deployed log address, and an RPC. Install once with `npm install`.

Run in this order:

```
node --env-file=scripts/.env scripts/ens/1-register-tocsin.mjs      # tocsin.eth on ENSv2 Sepolia (test USDC, commit, wait ~75s, register)
node --env-file=scripts/.env scripts/ens/2-setup-core.mjs           # our resolver + tocsin.eth subregistry + core.tocsin.eth
node --env-file=scripts/.env scripts/seed/seed-core.mjs --dry       # resolve evidence blocks, show the batches
node --env-file=scripts/.env scripts/seed/seed-core.mjs             # append 92 leaves to the log (one batch of 100 max per tx)
node --env-file=scripts/.env scripts/seed/publish-list.mjs          # sign the trust list, set the ENS record, write core.list.json
git add docs/plan/demo/seed && git commit -m "Seed: core list on Sepolia"   # so LIST_URI serves the signed document
```

What each one leaves behind:

- `scripts/ens/state.sepolia.json`: resolver proxy, subregistry proxy, the list name's node. Commit it.
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
