# 08: ENS lists on Sepolia (ENSv2, fallback text record)

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Trust lists, publication and ENSv2; Further notes, ENSv2 unverified. PRD: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b) and the verified-lookup bullet. HANDOFF step 4.

**What to build:** A reader that knows only the team's ENS name finds the current signed list on Sepolia through verified state, with no gateway in the path. The team's name is an ENSv2 subregistry, writers are subnames, and the maintainer key holds the publish role; if ENSv2 is not on Sepolia, a plain text record on the same name and the ENS prize is dropped.

**Blocked by:** 04 (Trust list documents, signing, and the publish CLI), 06 (Seed the Sepolia log and the relayer)

**Ethskills:** addresses, standards, tools (per AGENTS.md; load before starting)

**Status:** done for publication (6 Nov 2026); the reader half moves to ticket 03

- [x] First action: check whether ENSv2, a permissioned resolver, and Enhanced Access Control are deployed on Sepolia, and record the answer with addresses from official sources in Comments. No address is guessed.
- [x] If yes: the team's name mounted as a subregistry, each writer a subname, the `tocsin.list` record in a permissioned resolver, the publish role granted to the maintainer key. If no: the record on the plain name, and the spec's judge-checks note that the prize is not claimable.
- [x] The CLI from ticket 04 publishes the record value from the maintainer key read at run time.
- [ ] The reader resolves the record through `eth_call` with CCIP-read off, verifies root and signature, and shows an unverifiable record as stale while keeping the last verified version.
- [ ] Writer names reverse-resolve with the forward record checked; a mismatched forward record shows the shortened address.
- [x] Transaction hashes for the name setup recorded in Comments.

## Comments

6 Nov 2026, June-set run. This comment records the first run, on the 29 June 2026 contracts-v2 set, which the Universal Resolver does not read, so resolvers never saw these names or records. Its addresses and hashes are superseded by the next comment, and the scripts it names were replaced by `scripts/ens/setup-all.mjs`. Built at the time:

- tocsin.eth registered on the v2 ETHRegistry; its own UserRegistry subregistry 0x61F6B44C598d7171947eE059e1d486eDd6950b88 and PermissionedResolver 0x1cBF0A41B77416381C6eEC40b703BBe4722519E6, both through the Verifiable Factory; registry emancipated.
- Writers as subnames through the MirrorRegistrar (ticket 15): core, blockaid, etherscan, detector.
- The list record under the key tocsin.list (the ERC's erc-XXXX.list until numbered), published by scripts/seed/publish-list.mjs from the maintainer key: core.tocsin.eth v2 naming both writers, detector.tocsin.eth v1 naming itself. Records decode, signers recover to the maintainers, documents hash to the roots.
- Publish-role delegation exists (scripts/ens/5-delegate-publisher.mjs, authorizeTextRoles) and is not exercised yet; the maintainer key publishes directly.

Remaining items belong to the reader, not to ENS setup: resolving the record through eth_call with CCIP-read off against the verified state root, the maintainer pin and stale handling, and writer names from list entries. Tracked under ticket 03.

6 Nov 2026, October set redeploy. The names and lists were rebuilt on the 1 October 2026 ENSv2 set the Universal Resolver reads (addresses from `@ensdomains/ensjs` 5.2.12, `ensL1Contracts[11155111]`; the `deployments/sepolia` folder in `ensdomains/contracts-v2` is still the June set). Run with `node --env-file=scripts/.env scripts/ens/setup-all.mjs`.

- tocsin.eth owned by the maintainer key 0x8E2Cc65A08154a357136C8060DE5232FDdEe3e31; subregistry 0x45cb8bE82D927d8d310cd6B357708b0367B4435B, emancipated in 0x50be9f1fdeba9c0007203af4b147c51a2c1761ae0187d4902cf12f064f9a36c1; maintainer resolver 0xedB3Ac2276803E249be532E6Bab168Af4b9549A6.
- Names in the hub: core and detector (registered by the maintainer), blockaid and scamsniffer (claimed through the MirrorRegistrar 0x9319461337a2c5fb1992fd467708cc46d716a427 from separate keys; hashes in ticket 15).
- core.tocsin.eth carries tocsin.list version 3, tx 0xe88b75c113bf91ba813f9f11607e3c00fc87782031717976581d543f9178047d: core writer 0x36a279136adDde960599fcA356369C04A96D387E at weight 255 (92 leaves) and detector writer 0xe3a9678eD0992416C5230f52E3B1fF9775CCA999 at weight 1, warn.
- detector.tocsin.eth carries tocsin.list version 2, signed by the maintainer key, tx 0xe2b7a7d9fe3002d097b83c8e01fbb8a92536d30a0f31f87591db1a6ef995887c: the detector writer, 25 leaves in the log.
- Documents: docs/plan/demo/seed/core.list.json and detector.list.json, written by setup-all.mjs.
- Publish-role delegation on the October resolver is `grantSetterRoles(setter, account)` with `setText` calldata for the tocsin.list key. Not exercised; the maintainer key publishes directly.
