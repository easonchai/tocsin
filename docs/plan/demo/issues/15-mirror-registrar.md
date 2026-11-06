# 15: Mirror registrar: claim `<label>.tocsin.eth` by owning `<label>.eth`

Spec: this file. ERC: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b). ENSv2 docs: Permissioned Registry, Enhanced Access Control, For Contract Developers (the subname registrar tutorial), Verifiable Factory.

**What to build:** A permissionless, non-revocable directory of list names under `tocsin.eth` on ENSv2 Sepolia. Whoever owns `james.eth` can claim `james.tocsin.eth` in one transaction. Nobody, including the team, can take a claimed name back, change its resolver, or mint names outside the rule, and that is checkable on-chain.

**Blocked by:** tocsin.eth registered on ENSv2 Sepolia (done, `scripts/ens/1-register-tocsin.mjs`).

**Ethskills:** ship, security, addresses (per AGENTS.md; load before starting)

**Status:** ready-for-agent

## The rule

- `claim(label, resolver)`: registers `label.tocsin.eth` to `msg.sender` if and only if `ETHRegistry.findOwner(label) == msg.sender`. `findOwner` returns the zero address for an expired or unregistered name, so expired names cannot be claimed. The subname's expiry is set to the `.eth` name's expiry at claim time.
- `sync(label)`: anyone may call it. Extends `label.tocsin.eth`'s expiry to the current expiry of `label.eth`. The registry refuses to shorten an expiry, so the call is a no-op when nothing changed.
- When `label.eth` lapses, `label.tocsin.eth` lapses with it. A later owner of `label.eth` claims it fresh. ENSv2 burns the old token on re-registration, so the old owner's roles do not carry over.
- The claimant receives the same roles the ETH Registrar grants: set resolver, set subregistry, transfer, each with its admin. The claimant can therefore run its own sub-subnames and move its name.
- `core.tocsin.eth` is registered by the team before the registry is emancipated, with its expiry synced to `tocsin.eth` the same way. It is the one name that does not follow the mirror rule, and the write-up says so.

## Why not reservations or a review

A reviewed or reserved namespace makes the team a committee, which the pitch says does not exist. Ownership of the `.eth` name is the identity proof, and ENS already runs that process. Squatting is impossible by construction: the only account that can claim `scamsniffer.tocsin.eth` is the one holding `scamsniffer.eth`.

## Emancipation

ENSv2 roles on `ROOT_RESOURCE` apply to every name in a registry. The registry is emancipated when no account holds a dangerous root role: set resolver, set subregistry, unregister, transfer admin, upgrade, and their admin counterparts. Registrar and renew roles are operational and do not count.

After deploying the registrar and granting it `ROLE_REGISTRAR | ROLE_RENEW` on the subregistry's root, the setup script revokes every root role the owner account holds, including its own registrar role, so only the contract can mint. The deployed Sepolia `UserRegistryImpl` has no `isEmancipated()`, so the check is `hasAssignees(ROOT_RESOURCE, dangerousRoles) == false`, and the script prints it. This is irreversible: re-granting a dangerous role needs its admin role, which nobody holds afterwards.

What the team keeps: ownership of `tocsin.eth` itself in the ETH registry, which still allows repointing the subregistry. ENSv2 cannot remove that from a `.eth` owner. Say it plainly in the write-up: "we can replace the whole directory, we cannot touch a name inside it," and the subregistry's `setParent` pointer plus the revoked `ROLE_SET_PARENT` make any replacement visible.

## Files

- `scripts/ens/contracts/MirrorRegistrar.sol`: the contract, about 60 lines, no dependencies beyond two minimal interfaces. Built with `forge build --root scripts/ens`; the artifact `scripts/ens/MirrorRegistrar.json` (abi plus bytecode) is committed so the Node script can deploy without a Foundry install.
- `scripts/ens/2-setup-core.mjs`: deploys the subregistry, the registrar, registers `core`, grants and revokes roles, verifies emancipation, and writes `scripts/ens/state.sepolia.json`.
- `scripts/ens/3-claim.mjs <label>`: what a third party runs. Deploys their own Permissioned Resolver through the Verifiable Factory if they do not have one, claims the name, sets an addr record.
- `scripts/ens/test/MirrorRegistrar.t.sol`: Foundry fork test against the live Sepolia ENSv2 contracts: claim by owner succeeds, claim by non-owner reverts, re-claim reverts, sync extends after a renewal, non-owner cannot register through the registry directly.

## Acceptance

- [ ] `forge test --root scripts/ens --fork-url $SEPOLIA_RPC` passes.
- [ ] `2-setup-core.mjs` runs to completion on Sepolia and prints `emancipated: true`. State file committed.
- [ ] `3-claim.mjs` run from a second key that owns some `.eth` name on Sepolia mints `<label>.tocsin.eth`; the same call from a key that does not own it reverts with `NotNameOwner`.
- [ ] `sepolia.app.ens.domains/core.tocsin.eth` resolves to the maintainer address.
- [ ] Transaction hashes and the registrar address recorded in Comments.

## Pitch line

"Any security team that owns a .eth name already owns its slot under tocsin.eth. Claim it in one transaction. We cannot take it back: no account holds a dangerous role on the registry, and you can check that on-chain."
