# Claim your name under tocsin.eth on Sepolia

If you own `<label>.eth` on ENSv2 Sepolia, you can claim `<label>.tocsin.eth` in one transaction. Nobody approves it and nobody can take it back: the registry that holds these names has no account with a dangerous role, which you can check on-chain. The name is where you publish your own threat-flag list, so wallets can pin it by name.

Takes about five minutes and needs a little Sepolia ETH.

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

2. Create `scripts/.env` with two lines. The file is gitignored.

   ```
   PRIVATE_KEY=0x<your key>
   SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
   ```

   Any Sepolia RPC works. A single-node provider such as an Alchemy or Infura URL avoids the short waits the scripts add for load-balanced public RPCs.

3. If you do not own `<label>.eth` on ENSv2 Sepolia yet, register it. It costs 8 test USDC, which the script mints for you, plus gas. The commit-reveal wait is 75 seconds.

   ```
   node --env-file=scripts/.env scripts/ens/1-register-tocsin.mjs <label>
   ```

4. Claim `<label>.tocsin.eth`. The script deploys your own ENSv2 resolver through the Verifiable Factory if you do not have one, claims the name through the MirrorRegistrar, and sets the addr record to your key.

   ```
   node --env-file=scripts/.env scripts/ens/3-claim.mjs <label>
   ```

   Or do steps 3 and 4 together:

   ```
   node --env-file=scripts/.env scripts/ens/4-register-and-claim.mjs <label>
   ```

5. Check it at `https://sepolia.app.ens.domains/<label>.tocsin.eth`.

## What you get

- `<label>.tocsin.eth`, owned by your key, with the same expiry as `<label>.eth`. When you renew the `.eth` name, anyone can call `sync(label)` on the registrar to extend the subname.
- Your own Permissioned Resolver proxy, printed by the script. Records for your name live there, and only your key can set them.
- On your name you hold set-resolver, set-subregistry, and transfer, each with its admin, so you can delegate or lock them. Nothing on the registry's root can override you.

## Publishing a list under your name

The ERC's list record is the text key `erc-threat-flag-log.list` on your name, holding the ABI-encoded root, version, maintainer signature, and list URI. `scripts/seed/publish-list.mjs` builds and signs that record for the team's `core` list; adapting it to your name is a matter of pointing it at your resolver and node, which the claim script prints. A generalised publish command is on the list.

## Verify the guarantees yourself

```
cast call 0x61F6B44C598d7171947eE059e1d486eDd6950b88 \
  'hasAssignees(uint256,uint256)(bool)' 0 <dangerousRolesBitmap> --rpc-url $SEPOLIA_RPC
```

returns `false`: no account holds set-resolver, set-subregistry, unregister, transfer-admin, or upgrade on the registry root. The `dangerousRolesBitmap` is composed in `scripts/ens/common.mjs`. And

```
cast call 0x081d9c8ea86b6022c3e2f0a61f5c26cf9a7cb436 \
  'canClaim(string,address)(bool)' <label> <your address> --rpc-url $SEPOLIA_RPC
```

tells you before you spend gas whether the claim will go through.

## Addresses

| Contract | Sepolia |
| --- | --- |
| tocsin.eth subregistry (ENS UserRegistry proxy, emancipated) | `0x61F6B44C598d7171947eE059e1d486eDd6950b88` |
| MirrorRegistrar | `0x081d9c8ea86b6022c3e2f0a61f5c26cf9a7cb436` |
| ENSv2 ETHRegistry | `0x67b728a792e789a8978b30cF1b3b641f19354b43` |
| ENSv2 ETHRegistrar | `0xa4449a0dd2b83007553d9b1d28b583a46a805a30` |
| Verifiable Factory | `0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F` |

Source: `scripts/ens/contracts/MirrorRegistrar.sol`, tests in `scripts/ens/test/`. How the hub is wired: the README section "How the hub is wired on ENSv2."
