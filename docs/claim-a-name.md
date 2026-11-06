# Claim your name under tocsin.eth on Sepolia

If you own `<label>.eth` on ENSv2 Sepolia, you can claim `<label>.tocsin.eth` in one transaction. Nobody approves it and nobody can take it back: the registry that holds these names has no account with a dangerous role, which you can check on-chain. The name is where you publish your own threat-flag list, so wallets can pin it by name.

Takes about five minutes and needs a little Sepolia ETH.

**In the browser:** open `site/claim.html` (served from the repo, or at tocsin.eth.limo once published), connect a Sepolia wallet, type the label, and follow the four steps. The page does every step below for you, and its last two panels read the registry live so you can check the guarantees before you pay. The rest of this guide walks the same steps with the checks you can run from a terminal.

## What you need

- A wallet key with Sepolia ETH. About 0.02 ETH covers everything below. Faucets: sepoliafaucet.com, the Alchemy or Google Cloud Sepolia faucets.
- Node 20 or newer, and git.

## Steps

1. Clone and install.

   ```
   git clone https://github.com/easonchai/tocsin
   cd tocsin
   npm install
   ```

2. Pick a label the registrar will sell. Some labels are reserved on the Sepolia registrar: `etherscan`, for one, returns status 1 and `isAvailable` false, which is why the team's second claimant is `scamsniffer`. Check yours first:

   ```
   cast call 0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3 'isAvailable(string)(bool)' <label> --rpc-url $SEPOLIA_RPC
   ```

   `true` means you can register it. `false` with no owner means reserved or in grace; pick another label. If you already own `<label>.eth`, skip to step 4.

3. Register `<label>.eth` on the live ENSv2 registry if you do not own it yet, from the claim page or at https://sepolia.app.ens.domains. The registrar takes test USDC, which the mock token mints freely.

4. Claim `<label>.tocsin.eth` from the claim page, `site/claim.html` (served from the repo root with `python3 -m http.server 8732`): connect the wallet that owns the `.eth` name, type the label, claim. The page deploys your own ENSv2 resolver through the Verifiable Factory, calls the MirrorRegistrar, and sets the addr record. The terminal route is `scripts/ens/setup-all.mjs`, which does the same for the team's claimant keys. It needs the maintainer key, so the page is the path for a third party.

5. Check it at `https://sepolia.app.ens.domains/<label>.tocsin.eth`.

## What you get

- `<label>.tocsin.eth`, owned by your key, with the same expiry as `<label>.eth`. When you renew the `.eth` name, anyone can call `sync(label)` on the registrar to extend the subname.
- Your own Permissioned Resolver proxy, shown by the page. Records for your name live there, and only your key can set them.
- On your name you hold set-resolver, set-subregistry, and transfer, each with its admin, so you can delegate or lock them. Nothing on the registry's root can override you.

## How the team's claims ran

`node --env-file=scripts/.env scripts/ens/setup-all.mjs` runs every role from its own key in `scripts/.env` (see `scripts/.env.example`). `TOCSIN_PRIVATE_KEY` is the maintainer. `BLOCKAID_PRIVATE_KEY` and `SCAMSNIFFER_PRIVATE_KEY` each register `blockaid.eth` and `scamsniffer.eth`, deploy their own resolver, and claim `blockaid.tocsin.eth` and `scamsniffer.tocsin.eth`; the label is the slot name. Each claimant's resolver is recorded in `scripts/ens/claims.sepolia.json`, and a re-run reuses it from there, because the Verifiable Factory reverts when the same key deploys with the same salt twice. Flags: `--keep-roles`, `--skip-claims`, `--skip-lists`.

`detector.tocsin.eth` is different. The maintainer registered it in the hub for the live detector agent, and it was not claimed through the MirrorRegistrar. It resolves to the detector's writer key, `0xe3a9678eD0992416C5230f52E3B1fF9775CCA999`, which has 25 leaves in the log, and the maintainer signs its list. `DETECTOR_PRIVATE_KEY` is used only by `scripts/agent/detector.mjs`; `setup-all.mjs` does not run the detector.

## Publishing a list under your name

The ERC's list record is the text key `tocsin.list` on your name, holding the ABI-encoded root, version, maintainer signature, and list URI. `publishList` in `scripts/ens/setup-all.mjs` builds and signs that record for the team's `core` and `detector` lists; to publish your own, sign the same `ListRoot` typed data with your key and call `setText(dns("<label>.tocsin.eth"), "tocsin.list", record)` on your resolver. A generalised publish command is on the list.

## Verify the guarantees yourself

```
cast call 0x45cb8bE82D927d8d310cd6B357708b0367B4435B 'isEmancipated()(bool)' --rpc-url $SEPOLIA_RPC
```

returns `true`: no account holds set-resolver, set-subregistry, unregister, transfer-admin, or upgrade on the registry root. And

```
cast call 0x9319461337a2c5fb1992fd467708cc46d716a427 \
  'canClaim(string,address)(bool)' <label> <your address> --rpc-url $SEPOLIA_RPC
```

tells you before you spend gas whether the claim will go through.

## Addresses

| Contract | Sepolia |
| --- | --- |
| tocsin.eth subregistry (ENS UserRegistry proxy, emancipated) | `0x45cb8bE82D927d8d310cd6B357708b0367B4435B` |
| MirrorRegistrar | `0x9319461337a2c5fb1992fd467708cc46d716a427` |
| ENSv2 ETHRegistry | `0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4` |
| ENSv2 ETHRegistrar | `0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3` |
| Verifiable Factory | `0xDa70306C98E97eCe36F997a21368e53298572991` |
| PermissionedResolverImpl | `0x115eb53F0c60696633855F90b138178Fb40b2b2C` |
| Universal Resolver (proxy) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| MockUSDC | `0x240b0316Df57887DBBE58b586508b19e633a14aa` |

These are the ENSv2 contracts the Universal Resolver reads, from `@ensdomains/ensjs` 5.2.12 (`ensL1Contracts[11155111]`). The `deployments/sepolia` folder in `ensdomains/contracts-v2` is the older June 2026 set, which still answers calls but which no resolver reads; a name registered there resolves nowhere.

Source: `scripts/ens/contracts/MirrorRegistrar.sol`, tests in `scripts/ens/test/`. How the hub is wired: the README section "How the hub is wired on ENSv2."
