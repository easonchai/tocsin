# 08: ENS lists on Sepolia (ENSv2, fallback text record)

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Trust lists, publication and ENSv2; Further notes, ENSv2 unverified. PRD: `erc/eip-draft_threat_flag_log.md`, Trust lists, publication method (b) and the verified-lookup bullet. HANDOFF step 4.

**What to build:** A reader that knows only the team's ENS name finds the current signed list on Sepolia through verified state, with no gateway in the path. The team's name is an ENSv2 subregistry, writers are subnames, and the maintainer key holds the publish role; if ENSv2 is not on Sepolia, a plain text record on the same name and the ENS prize is dropped.

**Blocked by:** 04 (Trust list documents, signing, and the publish CLI), 06 (Seed the Sepolia log and the relayer)

**Ethskills:** addresses, standards, tools (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] First action: check whether ENSv2, a permissioned resolver, and Enhanced Access Control are deployed on Sepolia, and record the answer with addresses from official sources in Comments. No address is guessed.
- [ ] If yes: the team's name mounted as a subregistry, each writer a subname, the `erc-threat-flag-log.list` record in a permissioned resolver, the publish role granted to the maintainer key. If no: the record on the plain name, and the spec's judge-checks note that the prize is not claimable.
- [ ] The CLI from ticket 04 publishes the record value from the maintainer key read at run time.
- [ ] The reader resolves the record through `eth_call` with CCIP-read off, verifies root and signature, and shows an unverifiable record as stale while keeping the last verified version.
- [ ] Writer names reverse-resolve with the forward record checked; a mismatched forward record shows the shortened address.
- [ ] Transaction hashes for the name setup recorded in Comments.
