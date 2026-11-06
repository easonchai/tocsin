# 07: Spec Deployment section, README transition table, runbook

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment and README additions; Further notes, spec discrepancies. PRD: `docs/spec/threat-flag-log.md`, Deployment, Data availability, and Test Cases sections.

**What to build:** The PRD and the deployment agree, and someone with a fresh clone and only the env file can repeat the deploy from the README. The spec's snapshot wording is fixed so a mirror can be replayed.

**Blocked by:** 06 (CREATE2 deploy to Sepolia with verify and smoke append), 08 (ERC-7730 clear-signing descriptor)

**Ethskills:** ship, concepts, standards (per AGENTS.md; load before starting)

**Status:** resolved

- [x] Spec Deployment section carries the Sepolia address, runtime code hash, compiler version, and optimizer settings, labelled as the testnet deployment, and links the ERC-7730 descriptor from ticket 08.
- [x] Spec snapshot wording, in both the Data availability section and the Trust lists `snapshotURI` bullet: a snapshot carries the append block number per event, since the leaf hash commits to it and the ABI-encoded event does not. The event itself is unchanged.
- [x] Spec Test Cases section: the fixture from ticket 05 is named as the test vectors, and cases 10 to 12 point at the demo spec's reader library as the reference reader.
- [x] README transition table for `append` and `appendSigned`: caller, why they pay gas, and what happens if nobody calls, as the spec states.
- [x] README runbook: exact commands, required environment variable names, the expected address, verify commands, and the smoke test. No values of secrets.
- [x] Glossary entries for log, writer, leaf, subject, head, maintainer, reader, taken from the spec's Definitions.

## Comments

- 2026-11-06: Everything except the live address is done. The spec Deployment section carries the predicted Sepolia address, the runtime code hash measured on a Sepolia fork, and the compiler settings, labelled "predicted and not yet broadcast", and links both ERC-7730 files (v2 forces a calldata and an EIP-712 file, see ticket 08). Box 1 stays open until ticket 06's broadcast: then compare `cast code <addr> | cast keccak` with the recorded hash and drop "predicted". Snapshot wording now adds the append block number per event in both the Data availability section and the `snapshotURI` bullet. Test Cases names `parity.json` as the vectors and `@tocsin/reader` as the reference reader. README has the transition table, the runbook, and a gas note pointing at the snapshot. `GLOSSARY.md` added at the repo root.
- 2026-11-06: Box 1 done. On real Sepolia, `cast code 0xB639…5b14 | cast keccak` gives `0xd9f882cc…4ea5`, the same hash as the fork. The spec Deployment section no longer says "predicted and not yet broadcast". It has a row with deploy tx `0x10e8e5da…61b8`, block 12074077, and says "canonical mainnet address" so the pending-address sentence reads as mainnet only. `site/erc.html` rebuilt with `node scripts/build-erc.mjs`.
