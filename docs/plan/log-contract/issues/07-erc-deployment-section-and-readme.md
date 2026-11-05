# 07: ERC Deployment section, README transition table, runbook

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment and README additions; Further notes, ERC discrepancies. PRD: `erc/eip-draft_threat_flag_log.md`, Deployment, Data availability, and Test Cases sections.

**What to build:** The PRD and the deployment agree, and someone with a fresh clone and only the env file can repeat the deploy from the README. The ERC's snapshot wording is fixed so a mirror can be replayed.

**Blocked by:** 06 (CREATE2 deploy to Sepolia with verify and smoke append)

**Status:** ready-for-agent

- [ ] ERC Deployment section carries the Sepolia address, runtime code hash, compiler version, and optimizer settings, labelled as the testnet deployment. `site/erc.html` rebuilt and committed with it.
- [ ] ERC Data availability section: a snapshot carries the append block number per event, since the leaf hash commits to it and the ABI-encoded event does not. The event itself is unchanged.
- [ ] ERC Test Cases section: the fixture from ticket 05 is named as the test vectors, and cases 10 to 12 point at the demo spec's reader library as the reference reader.
- [ ] README transition table for `append` and `appendSigned`: caller, why they pay gas, and what happens if nobody calls, as the spec states.
- [ ] README runbook: exact commands, required environment variable names, the expected address, verify commands, and the smoke test. No values of secrets.
- [ ] Glossary entries for log, writer, leaf, subject, head, maintainer, reader, taken from the ERC's Definitions.
