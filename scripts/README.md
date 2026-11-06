# Scripts: the ENSv2 hub, the seed, the lists

All Sepolia, on the ENSv2 contract set the Universal Resolver reads (the 1 October 2026 redeploy). Fill `scripts/.env` from `.env.example`, one key per role, then run one command. `npm install` once.

```
node --env-file=scripts/.env scripts/ens/setup-all.mjs
```

The keys, one per role: `TOCSIN_PRIVATE_KEY` is the maintainer (owns `tocsin.eth`, the subregistry before emancipation, the maintainer resolver, `core` and `detector`, and signs both lists). `CORE_WRITER_PRIVATE_KEY` is the key whose 92 leaves are in the log; only its address is used, and it defaults to the maintainer. `BLOCKAID_PRIVATE_KEY` and `SCAMSNIFFER_PRIVATE_KEY` are the two claimants; the label each claims is the slot name, and each signs its own list. `DETECTOR_PRIVATE_KEY` is read only by `scripts/agent/detector.mjs`.

What it does, in order, skipping anything already in place:

1. Confirms the `TOCSIN` key owns `tocsin.eth` on the live ETHRegistry, or registers it (test USDC, commit, 75 s wait, register).
2. Uses the resolver already on the name if that key controls it, else deploys one through the Verifiable Factory.
3. Uses the subregistry already on the name if that key holds the root roles, else deploys a UserRegistry proxy and points `tocsin.eth` at it.
4. Deploys the MirrorRegistrar bound to that registry pair and grants it registrar and renew.
5. Registers `core.tocsin.eth` to the maintainer, expiry mirrored from `tocsin.eth`, and sets addr records.
6. For each of the `BLOCKAID` and `SCAMSNIFFER` keys present: registers `<label>.eth` if needed, takes that key's resolver from `claims.sepolia.json` if it has code there (the factory reverts on a reused salt, so a second deploy would fail), else deploys one, claims `<label>.tocsin.eth` through the MirrorRegistrar, sets its addr.
7. Reads `detector.tocsin.eth`, which the maintainer registered for the detector agent before this script existed. Whatever address it resolves to is the detector's writer. The script does not run the detector and does not claim that name.
8. Publishes, from the maintainer key, `detector.tocsin.eth`'s list naming the detector writer and `core.tocsin.eth`'s list naming the core writer at weight 255 and the detector writer at weight 1 (warn), under the text key `tocsin.list`, skipping any record whose content is already live. Then each claimant publishes, from its own key, `<label>.tocsin.eth`'s list naming that key: blockaid at weight 255, scamsniffer at weight 1 (warn), operator `<label>.eth`. For core, blockaid and scamsniffer it also writes the demo copies: `site/lists/<name>.json`, the bare list the reader parses, and `dapp/list-record.<label>.hex`, the live record with its list URI pointed at `http://localhost:8000/lists/<name>.json`. `demo.sh` follows those three names.
9. Emancipates the subregistry: revokes every root role from the maintainer, then records `isEmancipated()` and `hasAssignees(ROOT, dangerousRoles)`.
10. Resolves every name through the Universal Resolver proxy and prints what any app would see.

Flags: `--keep-roles` skips emancipation (irreversible once run), `--skip-claims`, `--skip-lists`.

Outputs to commit: `scripts/ens/state.sepolia.json`, `scripts/ens/claims.sepolia.json`, `docs/plan/demo/seed/<label>.list.json` for core, detector, blockaid and scamsniffer, and the demo copies above. The demo flags behind those lists come from `dapp/packages/infra/src/seed-names.ts` (`docs/plan/demo/runbook.md`, step 2c).

A claimant label must be free on the registrar. `registerEth` stops with "not available (status N: reserved or in grace)" when `isAvailable(label)` is false. `etherscan` is on the Sepolia registrar's reserved list (status 1), which is why the second claimant is `scamsniffer`. Check a label first with `cast call 0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3 'isAvailable(string)(bool)' <label> --rpc-url $SEPOLIA_RPC`.

Other scripts:

- `scripts/seed/seed-core.mjs [--dry]`: appends the 92 seed leaves under `CORE_WRITER_PRIVATE_KEY`. Already run; re-runs skip what `core.receipts.json` records.
- `scripts/agent/detector.mjs`: the agent-writer template. `--source sample` by default, `--source live` for the mainnet heuristic. Needs `DETECTOR_PRIVATE_KEY`, whose address is what `detector.tocsin.eth` resolves to (`0xe3a9…A999`, 25 leaves so far). Writes `docs/plan/demo/seed/detector.json`. Re-run `setup-all.mjs --skip-claims` afterwards if the lists need a new version.
- `scripts/ens/common.mjs`: addresses, ABIs, and helpers the above share. The addresses and every selector were checked against the deployed bytecode on 6 Nov 2026.

## The contracts, and the trap

`ensdomains/contracts-v2` still ships an older Sepolia set dated 29 June 2026 under `contracts/deployments/sepolia/`. Those contracts exist and answer calls, but the Universal Resolver, the ENS app, and ensjs read the October set. Names registered on the June set resolve nowhere. Take addresses from docs.ens.domains/learn/deployments or `@ensdomains/ensjs` 5.2.12 (`ensL1Contracts[11155111]`), never from that folder. The live hub on that set: subregistry `0x45cb8bE82D927d8d310cd6B357708b0367B4435B` (emancipated), MirrorRegistrar `0x9319461337a2c5fb1992fd467708cc46d716a427`, maintainer resolver `0xedB3Ac2276803E249be532E6Bab168Af4b9549A6`, maintainer `0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31`. The October resolver matches the docs: setters take a DNS-encoded name, roles are scoped with `grantSetterRoles`, and registries expose `isEmancipated()`.

## The MirrorRegistrar

`scripts/ens/contracts/MirrorRegistrar.sol`. `claim(label, resolver)` succeeds only when `ETHRegistry.findOwner(label)` is the caller; the subname's expiry copies the `.eth` name's, and anyone can `sync(label)` after a renewal. Spec: `docs/plan/demo/issues/15-mirror-registrar.md`. Tests, against a fork of the live contracts:

```
forge test --root scripts/ens --fork-url $SEPOLIA_RPC --fork-block-number <recent>
```

Pin the block; the public RPC is load balanced and a bare `latest` fork can hit a node that has not seen it. Rebuild the committed artifact after editing the contract: `forge build --root scripts/ens`, then copy `abi` and `bytecode.object` from `scripts/ens/out/MirrorRegistrar.sol/MirrorRegistrar.json` into `scripts/ens/MirrorRegistrar.json`.

## Lists and the record key

A list is a signed `TrustList` document; its hash, version, maintainer signature, and URI go into the `tocsin.list` text record on the publishing name. Any key string works as long as readers use the same one. Both of our writers declare the same operator, `tocsin.eth`, so a reader never counts them as independent.

Delegating the publish right to a hot key uses the resolver's `grantSetterRoles(setter, account)` with a `setText` calldata whose key is `tocsin.list`; the owner's key stays cold. Not wired into the mega script yet.
