# 15: Mirror registrar: claim `<label>.tocsin.eth` by owning `<label>.eth`

Spec: this file. ERC: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b). ENSv2 docs: Permissioned Registry, Enhanced Access Control, For Contract Developers (the subname registrar tutorial), Verifiable Factory.

**What to build:** A permissionless, non-revocable directory of list names under `tocsin.eth` on ENSv2 Sepolia. Whoever owns `james.eth` can claim `james.tocsin.eth` in one transaction. Nobody, including the team, can take a claimed name back, change its resolver, or mint names outside the rule, and that is checkable on-chain.

**Blocked by:** tocsin.eth registered on ENSv2 Sepolia (done, `scripts/ens/1-register-tocsin.mjs`).

**Ethskills:** ship, security, addresses (per AGENTS.md; load before starting)

**Status:** ready-for-human (deployed on Sepolia 6 Nov 2026; remaining: third-party claim demo)

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

## Comments

6 Nov 2026, deployed on Sepolia by the maintainer key 0x36a279136adDde960599fcA356369C04A96D387E:

- tocsin.eth registered: 0x9e8b2a8d9889f148d24010d25f708c03e5998b7ab1459b6b6e4569b62320ed0f
- resolver proxy 0x1cBF0A41B77416381C6eEC40b703BBe4722519E6: 0x95668f78dd2b75fd5507d4d8fa4faaf225ebfbd64882c61ee0fac89bbad89aab
- subregistry proxy 0x61F6B44C598d7171947eE059e1d486eDd6950b88: 0x5eb6bf2ef3559f776e869bd2286515f82db086c7a3f4f93963f3940269e7376f
- setSubregistry: 0xfaafcb925eeee295aae651f0dc7d75ab62a343dfff8a3af5bbcf568964434809; setParent: 0x551a8c73b24ef0759f6b2ee40aa76c352001f4600f9fc7ba61ae8fdabf2840ce; tocsin.eth resolver: 0xf85cac5061921d776223d529c34ede2453736dd676ad74cb4b654412c79309ce
- MirrorRegistrar 0x081d9c8ea86b6022c3e2f0a61f5c26cf9a7cb436: 0x173396d955c012e55266879b34f33472ba0dbcc5a427969a1a5bd5b9d70d831a; roles granted: 0xcf1e6c613233ae16806baa1544e3af75451c264a203d02de1554b4ed6c4f5aa6
- core.tocsin.eth registered: 0x9ce57cacef83420b10939c51415b59dc59988fa935be3ef42f00c953dd1d2342; addr records: 0x5bab06d4fa2c8f47b94f666af461680834678ebaec89cd7ba5c023086b65eb32, 0x2bb5fe670213a400caa0506003b5c65828d1c2817ffdebcb98d5e3f1522b14b4
- emancipation: 0x657f671b0701890804a788111e8041f6344117f8adf7226ef9a91ba8b2e7781c. Verified afterwards with cast: hasAssignees(0, dangerous) = false, registrar holds REGISTRAR|RENEW, core owner and resolver as expected.

Acceptance still open: a claim from a second key (4-register-and-claim.mjs), and the ENS app check.
