# Scripts: the ENSv2 hub, the seed, the lists

All Sepolia, on the ENSv2 contract set the Universal Resolver reads (the 1 October 2026 redeploy). Fill `scripts/.env` from `.env.example`, one key per role, then run one command. `npm install` once.

```
node --env-file=scripts/.env scripts/ens/setup-all.mjs
```

What it does, in order, skipping anything already in place:

1. Confirms the `TOCSIN` key owns `tocsin.eth` on the live ETHRegistry, or registers it (test USDC, commit, 75 s wait, register).
2. Uses the resolver already on the name if that key controls it, else deploys one through the Verifiable Factory.
3. Uses the subregistry already on the name if that key holds the root roles, else deploys a UserRegistry proxy and points `tocsin.eth` at it.
4. Deploys the MirrorRegistrar bound to that registry pair and grants it registrar and renew.
5. Registers `core.tocsin.eth` to the maintainer, expiry mirrored from `tocsin.eth`, and sets addr records.
6. For each of `BLOCKAID`, `ETHERSCAN`, `DETECTOR` keys present: registers `<label>.eth` if needed, deploys that key's resolver, claims `<label>.tocsin.eth`, sets its addr.
7. Runs the detector agent once if its writer has no leaves yet (five sample flags).
8. Publishes `detector.tocsin.eth`'s self-list and `core.tocsin.eth`'s list naming the core writer and the detector at warn weight, under the text key `tocsin.list`, skipping any record whose content is already live.
9. Emancipates the subregistry: revokes every root role from the maintainer, then prints `isEmancipated()`.
10. Resolves every name through the Universal Resolver proxy and prints what any app would see.

Flags: `--keep-roles` skips emancipation (irreversible once run), `--skip-claims`, `--skip-lists`.

Outputs to commit: `scripts/ens/state.sepolia.json`, `scripts/ens/claims.sepolia.json`, `docs/plan/demo/seed/*.list.json`, `docs/plan/demo/seed/detector.json`.

Other scripts:

- `scripts/seed/seed-core.mjs [--dry]`: appends the 92 seed leaves under `CORE_WRITER_PRIVATE_KEY`. Already run; re-runs skip what `core.receipts.json` records.
- `scripts/agent/detector.mjs`: the agent-writer template. `--source sample` by default, `--source live` for the mainnet heuristic. Needs `DETECTOR_PRIVATE_KEY`.
- `scripts/ens/common.mjs`: addresses, ABIs, and helpers the above share. The addresses and every selector were checked against the deployed bytecode on 6 Nov 2026.

## The contracts, and the trap

`ensdomains/contracts-v2` still ships an older Sepolia set dated 29 June 2026 under `contracts/deployments/sepolia/`. Those contracts exist and answer calls, but the Universal Resolver, the ENS app, and ensjs read the October set. Names registered on the June set resolve nowhere. Take addresses from docs.ens.domains/learn/deployments or `@ensdomains/ensjs`, never from that folder. The October resolver matches the docs: setters take a DNS-encoded name, roles are scoped with `grantSetterRoles`, and registries expose `isEmancipated()`.

## The MirrorRegistrar

`scripts/ens/contracts/MirrorRegistrar.sol`. `claim(label, resolver)` succeeds only when `ETHRegistry.findOwner(label)` is the caller; the subname's expiry copies the `.eth` name's, and anyone can `sync(label)` after a renewal. Spec: `docs/plan/demo/issues/15-mirror-registrar.md`. Tests, against a fork of the live contracts:

```
forge test --root scripts/ens --fork-url $SEPOLIA_RPC --fork-block-number <recent>
```

Pin the block; the public RPC is load balanced and a bare `latest` fork can hit a node that has not seen it. Rebuild the committed artifact after editing the contract: `forge build --root scripts/ens`, then copy `abi` and `bytecode.object` from `scripts/ens/out/MirrorRegistrar.sol/MirrorRegistrar.json` into `scripts/ens/MirrorRegistrar.json`.

## Lists and the record key

A list is a signed `TrustList` document; its hash, version, maintainer signature, and URI go into the `tocsin.list` text record on the publishing name. The ERC calls the key `erc-XXXX.list` until numbered; any string works as long as readers use the same one. Both of our writers declare the same operator, `tocsin.eth`, so a reader never counts them as independent.

Delegating the publish right to a hot key uses the resolver's `grantSetterRoles(setter, account)` with a `setText` calldata whose key is `tocsin.list`; the owner's key stays cold. Not wired into the mega script yet.
