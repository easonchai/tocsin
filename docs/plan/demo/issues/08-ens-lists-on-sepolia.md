# 08: ENS lists on Sepolia (ENSv2, fallback text record)

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Trust lists, publication and ENSv2; Further notes, ENSv2 unverified. PRD: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b) and the verified-lookup bullet. HANDOFF step 4.

**What to build:** A reader that knows only the team's ENS name finds the current signed list on Sepolia through verified state, with no gateway in the path. The team's name is an ENSv2 subregistry, writers are subnames, and the maintainer key holds the publish role; if ENSv2 is not on Sepolia, a plain text record on the same name and the ENS prize is dropped.

**Blocked by:** 04 (Trust list documents, signing, and the publish CLI), 06 (Seed the Sepolia log and the relayer)

**Ethskills:** addresses, standards, tools (per AGENTS.md; load before starting)

**Status:** done (6 Nov 2026)

- [x] First action: check whether ENSv2, a permissioned resolver, and Enhanced Access Control are deployed on Sepolia, and record the answer with addresses from official sources in Comments. No address is guessed.
- [x] If yes: the team's name mounted as a subregistry, each writer a subname, the `erc-threat-flag-log.list` record in a permissioned resolver, the publish role granted to the maintainer key. If no: the record on the plain name, and the spec's judge-checks note that the prize is not claimable.
- [x] The CLI from ticket 04 publishes the record value from the maintainer key read at run time.
- [x] The reader resolves the record through `eth_call` with CCIP-read off, verifies root and signature, and shows an unverifiable record as stale while keeping the last verified version.
- [x] Writer names reverse-resolve with the forward record checked; a mismatched forward record shows the shortened address.
- [x] Transaction hashes for the name setup recorded in Comments.

## Comments

- 2026-11-06: ENSv2 is deployed on Sepolia, with the permissioned resolver and Enhanced Access Control. The ENS prize stays in scope and the spec's fallback did not trigger.
  - Sources. The ENS deployments page (docs.ens.domains/learn/deployments, section "Sepolia (ENSv2)"), whose source `ensdomains/docs` `src/pages/learn/deployments.mdx` was last changed by "ENSv2 activation PR (#615)" on 2026-10-26. It says the Universal Resolver and the ENS apps for Sepolia resolve through this deployment and marks the old ENSv1 contracts as no longer in use. The second source is the table in `@ensdomains/ensjs@5.2.12`, `dist/clients/chain.js`, `ensL1Contracts[11155111]`, which matches the docs for every contract below.
  - Contracts, each with code on Sepolia at block 12071737 (checked with `cast code` against a public Sepolia RPC, because the `chains` MCP server has no Sepolia entry):

    | Contract | Address | Code |
    | --- | --- | --- |
    | RootRegistry | `0xb458d6a3a77919449d03e7a6903c26827c1ec43f` | 16,000 bytes |
    | ETHRegistry (ensjs `ensRegistry`) | `0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4` | 16,000 bytes |
    | ETHRegistrar | `0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3` | 8,037 bytes |
    | VerifiableFactory | `0xDa70306C98E97eCe36F997a21368e53298572991` | 1,524 bytes |
    | PermissionedResolverImpl | `0x115eb53F0c60696633855F90b138178Fb40b2b2C` | 15,608 bytes |
    | UserRegistryImpl | `0x9BD8a88719068D09ecee662f36C0E3856708366a` | 18,982 bytes |
    | UpgradableUniversalResolverProxy | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` | 2,491 bytes |
    | UniversalResolverV2 | `0x24e1d8e068620b647ca097f961a61055f4f42d72` | 18,792 bytes |
    | PublicResolverV2 | `0xdc4a563d00f5c3012b699794eb9e13a561be386f` | 14,327 bytes |
    | MockUSDC (registration payment) | `0x240b0316Df57887DBBE58b586508b19e633a14aa` | 4,309 bytes |
    | ReverseRegistrar (ENSv1, `addr.reverse`) | `0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6` | 3,382 bytes |

  - Onchain cross-check: `RootRegistry.getSubregistry("eth")` returns the ETHRegistry above.
  - Trap. `ensdomains/contracts-v2` on `main` still carries an older Sepolia set dated 2026-06-29 in `contracts/deployments/sepolia/` and `contracts/docs/addresses/sepolia.md` (for example ETHRegistry `0x67b7...4b43`, PermissionedResolverImpl `0x7e4b...2303`). `ensdomains/bigname` `docs/sepolia-deployment.md` records that upstream redeployed on 2026-10-01 and that the Universal Resolver moved to the new set. Use the docs and ensjs addresses, never that repo directory. The scripts read addresses from ensjs at run time, so none are hard-coded except the Universal Resolver proxy in the reader.
  - Enhanced Access Control on the resolver has no per-name scope (docs.ens.domains/ensv2/permissioned-resolver). The maintainer's `setText` grant on the two list keys covers every name that this resolver serves, the writer subnames included. That is acceptable because readers only read the team's name, but anyone reviewing the grants should know it.
- 2026-11-06: Built and rehearsed on an anvil fork of Sepolia (`anvil --fork-url <public sepolia rpc> --port 8548`, forked at block 12071766). Nothing was sent to Sepolia.
  - Files. `dapp/packages/reader/src/ens.ts` exports `EthCall`, `UNIVERSAL_RESOLVER`, `universalResolverAbi`, `resolveListRecord(call, name, kind?, universalResolver?)`, and `reverseName(call, address, universalResolver?)`. Tests are in `dapp/packages/reader/test/ens.test.ts`. On the infra side there is `dapp/packages/infra/src/ens-setup.ts` (`yarn ens-setup`, `yarn ens-publish <list|safelist> <record.hex|->`), plus `connectChain()` in `src/env.ts` and the ENS variables in `.env.example`. `src/index.ts` still needs `export * from "./ens"`.
  - Reader. One `eth_call` goes to the Universal Resolver's `resolveWithGateways` with an empty gateway list, so CCIP-read is off. Any revert, OffchainLookup included, or any failed call returns `undefined`, which `acceptList` turns into stale. The reverse lookup calls `reverseWithGateways` for coin type 60, then reads the name's forward `addr` through the same call and drops the name on a mismatch.
  - The anvil dev accounts (the `test ... junk` mnemonic) all carry EIP-7702 delegations on Sepolia, so the ETHRegistrar's ERC-1155 mint to them reverts with `ERC1155InvalidReceiver`. The rehearsal used fresh throwaway keys funded with `anvil_setBalance`. Do not use well-known keys on Sepolia either.
  - Rehearsal, in order. Registered `tocsin-rehearsal.eth` through the real ETHRegistrar: open `MockUSDC.mint`, approve, commit, 61 s wait, register (fork tx `0x7d45...dd52`, price 8 USDC for a year). `yarn ens-setup` then deployed the PermissionedResolver `0x37e2...F564` (`0x1796...2e79`), called `setResolver` (`0x625d...7dab`), deployed the UserRegistry `0xbA5D...64a4` (`0x7e7d...bb3b`), and called `setSubregistry` (`0x3166...02b0`). It registered `manual` (`0x69f0...17df`) and `detector` (`0x758f...58b4`) as subnames, set their addr records (`0xa502...fa08`, `0x7377...7554`), and granted the maintainer setText on the list key (`0xdb03...6e4e`) and on the safelist key (`0xe7bf...44ff`). It set the manual writer's reverse name (`0xd17f...3efc`) and skipped the detector, which holds no ETH. A second `ens-setup` reused the resolver, the subregistry, and both subnames.
  - `publish-list fill` and `sign` produced a version 1 record signed by the maintainer. `yarn ens-publish list record.hex` set it (`0x5722...aa98`). The same command with the manual writer's key was refused with `EACUnauthorizedAccountRoles` (resource `keccak256("erc-threat-flag-log.list")`, role `0x10` = ROLE_SET_TEXT).
  - Read-back with `ens.ts` through the fork's `eth_call`. `resolveListRecord` returned the 352-byte record. `acceptList` gave `accepted`, version 1, with the maintainer as signer. With a call that throws, it gave `stale` and kept version 1. An unregistered name returned `undefined`. `reverseName(manual)` returned `manual.tocsin-rehearsal.eth` and `reverseName(detector)` returned `undefined`. After the owner pointed manual's addr at the detector address (`0x9e5e...ada3`), `reverseName(manual)` returned `undefined`, and restoring the addr brought the name back. Every read was an `eth_call` to `0xeEeE...EeEe`.
  - Tests: reader 62 passed (8 new in `ens.test.ts`), infra 35 passed, and `tsc --noEmit` is clean in both packages.
- 2026-11-06: Runbook for the live setup. Only a human can do these steps: they need funded keys and the team's name.
  1. Make fresh keys for the name owner and the maintainer. Fund the owner, the maintainer, and the manual writer with Sepolia ETH. The detector stays at zero.
  2. From the owner key, register the team's name at sepolia.app.ens.domains. If the app will not take payment, use the rehearsal's path with `cast`: `MockUSDC.mint(owner, 100e6)` (the mint is open), `approve(ETHRegistrar, 100e6)`, `makeCommitment(label, owner, secret, 0x0, 0x0, 31536000, 0x0)`, `commit`, wait 60 s, then `register(label, owner, secret, 0x0, 0x0, 31536000, MockUSDC, 0x0)`.
  3. In `dapp/packages/infra/.env`, set `RPC_URL`, `CHAIN_ID=11155111`, `ENS_NAME`, `ENS_OWNER_PRIVATE_KEY`, `ENS_WRITERS=manual=<addr>,detector=<addr>`, `ENS_MAINTAINER`, `MAINTAINER_PRIVATE_KEY`, and `MANUAL_WRITER_PRIVATE_KEY` (for its reverse record).
  4. `yarn workspace @tocsin/infra ens-setup`. Paste every printed transaction hash under this comment, which ticks the last box.
  5. `yarn workspace @tocsin/reader publish-list sign <site/lists/default.json> <listURI> > record.hex`, then `yarn workspace @tocsin/infra ens-publish list record.hex`. Paste the hash.
  6. Check the record at sepolia.app.ens.domains/<name>. Once `src/index.ts` exports `./ens`, check it through the reader too, with `resolveListRecord` over the host's Helios `eth_call`.
  7. The detector's reverse name needs one transaction from the detector key. Without it, the detector shows as a shortened address. Funding the detector for that one transaction is the team's call.

- 2026-11-06, Sepolia registration of `tocsin.eth` (step 2), through the ENSv2 ETHRegistrar from the owner `0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31`, one year, 8.000021 MockUSDC. The ETHRegistry minted the token to the owner in the register tx.
  - MockUSDC mint `0x03131fecee1f28ed2858daaaf6694a97a64967f702db1cd4afb15fe74117e6c5` (block 12074292)
  - approve `0x0ff292046481e2c5a1f4d4700fe9caa615338c436f66a9d5fe897ee8aa0e2cba` (12074293)
  - commit `0x5a1e3c470afd275c0227c6a857642869da8454fef58d2687423f9309192f3fd8` (12074294)
  - register `0x9e8c300d5907a7b7312f95fbf103e4daaabe9a9812b3a9b953ea87dd74340e06` (12074301)

- 2026-11-06, ENSv2 setup of `tocsin.eth` (step 4) from the owner, RPC `0xrpc.io/sep`. Resolver `0xedB3Ac2276803E249be532E6Bab168Af4b9549A6`, subregistry `0x45cb8bE82D927d8d310cd6B357708b0367B4435B`.
  - deploy PermissionedResolver `0x020e98591b88029ada31b4ea6cd2070eb6d926df0a8a64894fa38e0b36e0800d`, setResolver `0x3b74bf79369a086ea093bb955bd3fc103dfb4ccc7ed23c69f744aa782cf22a1b`
  - deploy UserRegistry `0x1ef1e98bb4751ba4883c61693ab72a77ed3478706bb82449d4ba9b928526d5e6`, setSubregistry `0xf4c9f630fd930b4b80bfde546ee704b68978bb9e28c9a1746b2c46a54a63339e`
  - register manual `0xabcd6343ccf7c8a7216374b8711bc847d30c3a7fd1cd86a4e4924d80efa3249b`, detector `0x4c0e4ed0132e968ba1cfbc6c335f4a99d8da711f2b61456f5296c49b3469b78c`
  - addr manual `0x0d6cd2a638a65953b62fdbb8d5b880a4e79ec21ac89636446bb96f796c7e78ae`, detector `0x5595e541cf8a378ec47120811c7cccda24aacc29d911c04124a2cfd40b18b3a3`
  - grant setText list `0x9df7f0d3baca6add668fe5c28a74190ef878d58a7e21b4cd6decea1eaffe3dd4`, safelist `0xbd9b0bbb11b213f7b341a2fe525f6510bef9cfbadd0bd71bea44176aab7c6fe4`
  - reverse manual `0xa3148c8d044a856dd0a6ece9a92c00c6f2912564d0e82ad6ac41253b1ba29108`. Detector skipped, it holds no ETH.
  - list record v1 (listURI `http://localhost:8000/lists/default.json`) `0x92aa56fd34a4fa607b017f4b09cddc1af9b53607167428a6876f48b80f0e3ab5`
- 2026-11-06, two curator lists for the multi-list demo, each its own ENSv2 name with its own resolver, maintainer and writer subname. Registered by the same owner (MockUSDC approve then commit and register, 8 USDC each). Keys are in `packages/infra/.env` as `HARBOR_*` and `LANTERN_*`. `ens-setup.ts` now salts the resolver with the name's node: the old owner-only salt collided on a second name, and a shared resolver would let one name's maintainer set another's list (EAC has no per-name scope).
  - `harborwatch.eth`: register `0xdc3c8cbd5a066c50c2ae713c680a265921676204ad67fbee1e428b84947cbf3a`. Resolver `0xFc7Dd16C3E536999e2629Faf9cBc465438c0E452` (`0x46da07fe8ddc94553a80c4cdd26382896fd8b25a59a97c55a5359e3b79947d38`), setResolver `0x582de185f2d339c226a9b898dc9d5490f69f802b3f743253448de82a9cbdcb64`, subregistry `0x281C93054411069C6D803B4fE07A8B75b212dfC3` (`0x578f14012ba5845cc4a40195c8ddc253b349d35fc4f1b280c1363fc846ea5821`, set `0x44548de2ef926241069b360e3a5689d007b54777ba28543a452d492e628e6512`), `feed` subname `0x8dd05e3e26ff737a6f810437b3358ebde5b67746e92369e97633e136e36c0bd1`, addr `0xd6e7bf0022abca56f7d9a9694e46d4da7bc17f0b14cf382bf9305735a526a601`, grants `0x425ad89adf31368fd6896ac1b677bd3aee26e7fe7b6c675c68cf30af003b2687` and `0x26b42840c817effe53a41958f726eb2ed11b8f1adbc5d73202989c1935344956` to maintainer `0x70d1d86B5537f1BeB8a89e57a4761F6d11d08706`, reverse `0x6ff449e06ed6e5b51e16fec5894f514c51dad3f443e1a6e9edf40474399f0693`, list record `0xd4d2d536cc0e39fd8c08525f0e4281fcf2edb4bfd20830b91453789f72e62cfb`. Writer `feed.harborwatch.eth` = `0x6A690bB216f9e691FB4706eb7D59Fae610D081ad`, weight 255, 7 flags relayed in `0x3725c75cfdcd2a59dc1721ded1001aa0a83123c1f63e52e0043de64565af9dce`.
  - `lanterndao.eth`: register `0xc13b958ad653efa465840cd6dd359fcf132d5e59ac9b74e2772ab8deb48624f8`. Resolver `0xFeB718C1754de75130EB5A9FBdD0eaC3eEbD3aE9` (`0xf3ff39a3f318603bc793ae4acedb6bc6f8777469565abbd0b93916b351bd80ba`), setResolver `0x595cfef57e11001b1ac098a84c8e855959c1faa7b07bdb64a82ba4e384ace63e`, subregistry `0x8fb9C0909c714E7345034331c13abF6eC342B33E` (`0xba5cbb2ed8fe497242a1256bebb5f2f203de18b4509bb8f797efa66c6c710e30`, set `0x3036b13f79a5276a1a3ac27c5d024e6b2e629c05ff18cc78ac18ab3e6dd874f6`), `feed` subname `0x25ce238b3d206e621b02c45045c0b635a1e23c332b3ec2a67a225b2b704f00f1`, addr `0x2e9bf7f792640070e06a5db3808883b1d2a6600a2365570db047a84677a27e03`, grants `0x5a0b408920b489a04d4aa1ec35b73031f34d24687036ee4742bcb02d2372fb45` and `0x4fee8f2149c5e452a94014f28842d175d8b8e3df21038f6db788a0078fc4d1b1` to maintainer `0xAf85cDA5fAb801FbCd6aB0060f21B5125f02Ae24`, reverse `0x30433dd2d4f2d557b75f350ff2b3ba438898398f05a91249ed5528031a7a1ed2`, list record `0x0387675b09a436c3d1db08ff657888b95710d13daef7351cfea75478f484896d`. Writer `feed.lanterndao.eth` = `0x81fA2D7b81B951071738263f5b24688b15a6972C`, weight 1, 6 flags relayed in `0xa84cc88a1c65e0216e26b1c39d34386e32abaae0579552f6c18b64d4f0becb16`.
  - Read back through the Universal Resolver with CCIP-read off: all three names return a v1 record. Reverse names verify for manual, both feeds; the detector has none.
  - The funding, approve and commit hashes were not captured; the owner's Sepolia history has them.
- 2026-11-06, from `main`: ENSv2 is live on Sepolia (contracts-v2 deployment of 29 June 2026; addresses in README). Built and verified:
  - tocsin.eth registered on the v2 ETHRegistry; its own UserRegistry subregistry 0x61F6B44C598d7171947eE059e1d486eDd6950b88 and PermissionedResolver 0x1cBF0A41B77416381C6eEC40b703BBe4722519E6, both through the Verifiable Factory; registry emancipated.
  - Writers as subnames through the MirrorRegistrar (ticket 15): core, blockaid, etherscan, detector.
  - The list record under the key tocsin.list (the ERC's erc-XXXX.list until numbered), published by scripts/seed/publish-list.mjs from the maintainer key: core.tocsin.eth v2 naming both writers, detector.tocsin.eth v1 naming itself. Records decode, signers recover to the maintainers, documents hash to the roots.
  - Publish-role delegation exists (scripts/ens/5-delegate-publisher.mjs, authorizeTextRoles) and is not exercised yet; the maintainer key publishes directly.
