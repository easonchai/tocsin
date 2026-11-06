# 15: Mirror registrar: claim `<label>.tocsin.eth` by owning `<label>.eth`

Spec: this file. ERC: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b). ENSv2 docs: Permissioned Registry, Enhanced Access Control, For Contract Developers (the subname registrar tutorial), Verifiable Factory.

**What to build:** A permissionless, non-revocable directory of list names under `tocsin.eth` on ENSv2 Sepolia. Whoever owns `james.eth` can claim `james.tocsin.eth` in one transaction. Nobody, including the team, can take a claimed name back, change its resolver, or mint names outside the rule, and that is checkable on-chain.

**Blocked by:** tocsin.eth registered on ENSv2 Sepolia (done, `scripts/ens/1-register-tocsin.mjs`).

**Ethskills:** ship, security, addresses (per AGENTS.md; load before starting)

**Status:** done (deployed and claimed on Sepolia 6 Nov 2026)

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

Claims from two stranger keys through 4-register-and-claim.mjs:

- blockaid.eth registered by 0x6f1524F5A1152d6b08ef8833E42E4311151e904F: 0x2c2f64393778c0d60a3f5aecf3e899ed94f88d969b543e2ad83b9ba7877e133f; resolver 0x27209FA079b88bf30DCc43d4324D7c8A4f4E2b33: 0x1b657d56b25c7c22558d7bac88bfd31643cb4edc564b2c18ef3f559110b5660b; claim blockaid.tocsin.eth: 0x59611357a55183df37a558010fe2b1fa63066a9743a66a8af0df9dabd0c3c976; addr: 0xa456cbd24d5916a43f4973d4a9e3887d87255b0666a73fdb351918130942b3c8
- etherscan.eth registered by 0x3a05D06949b9890aEAD4700AA5ECEbf4D1BA0Ba0: 0x14afb33f2c3b4d051ac328a079e162f8ddab67d2252c80770240d532515bf115; resolver 0xf8c4d03277e3a124821c3D426fEAE6056Ad9aA92: 0x6a0313a7782cab2fc94042698292ce7c1e9bba60fc1c3745d3594d7c3e146055; claim etherscan.tocsin.eth: 0x456da39e5c259c58cfafd0897449145ef924950c8177e9bf70a476fee8557808; addr: 0xd3ff5f25b2a91064d6c4b38297614644dbf85990bece40b559fa3dfee0905d0f

The first blockaid run failed on an RPC lag read (owner read as zero one block after the receipt); fixed in ced0b33 with settle and retry helpers. User guide: docs/claim-a-name.md.

detector.eth registered and detector.tocsin.eth claimed by the detector key 0xe2605fA3c6CED0E1Dc05D19A0F1FdF51Dc5e7301: register 0xf0dfe165e159a968191659c6692b2fb660edad2138810f67a848b3fd1ad9eeea; resolver 0x9D37b2C6a165ff7f30e8926224f3305ED273b7b1: 0xe236aa6cb9b7ac0d9502c4acfe25bc5c072f16f32dd82a3a88ea6d5a7a986bac; claim: 0xdd00e1eb4b4ffd668b6e6551235b8ceed9467f52e60dae94f04b5a1382894bb9; addr: 0x52b07d9058df32b4daa752e002706d84a449f425cf67b489c72c804a0799a9c6.

Lists published under tocsin.list: detector v1 0x88b482f8b60097495a4e11204db8ede21ce570c4145d8c409816409dbe24dc02; core v2 (both writers, detector at warn weight) 0xc99899b004fa42135e1a1858e92253a3c478bb26c6ad183caecd4b6640e56e6d. Detector's first leaf: 0xca64af9b691cc076b64abf409d8337afa515266cd8ccb0ed047916ff8d5bb514. Verified: both records decode, signers recover to the maintainers, committed documents hash to the roots, writer heads read 92 and 1.
