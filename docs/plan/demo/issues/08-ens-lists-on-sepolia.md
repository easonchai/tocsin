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

6 Nov 2026. ENSv2 is live on Sepolia (contracts-v2 deployment of 29 June 2026; addresses in README). Built and verified:

- tocsin.eth registered on the v2 ETHRegistry; its own UserRegistry subregistry 0x61F6B44C598d7171947eE059e1d486eDd6950b88 and PermissionedResolver 0x1cBF0A41B77416381C6eEC40b703BBe4722519E6, both through the Verifiable Factory; registry emancipated.
- Writers as subnames through the MirrorRegistrar (ticket 15): core, blockaid, etherscan, detector.
- The list record under the key tocsin.list (the ERC's erc-XXXX.list until numbered), published by scripts/seed/publish-list.mjs from the maintainer key: core.tocsin.eth v2 naming both writers, detector.tocsin.eth v1 naming itself. Records decode, signers recover to the maintainers, documents hash to the roots.
- Publish-role delegation exists (scripts/ens/5-delegate-publisher.mjs, authorizeTextRoles) and is not exercised yet; the maintainer key publishes directly.

Remaining items belong to the reader, not to ENS setup: resolving the record through eth_call with CCIP-read off against the verified state root, the maintainer pin and stale handling, and writer names from list entries. Tracked under ticket 03.
