# 01: Hour 0 to 6 harness: Helios plus Anon-RPC on Sepolia

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Hour 0 to 6 harness. PRD: `erc/eip-draft_threat_flag_log.md`, Light-client read procedure; Security Considerations, Query privacy. HANDOFF step 1.

**What to build:** One page in the scaffold's Next.js package that opens, syncs Helios on Sepolia, bootstraps the Anon-RPC worker through Helios, routes Helios's execution reads through the worker over Tor, and prints the proven values of the log's storage slots 2 and 3 together with the transport in use. Switching to Nym works; passthrough does not exist. At hour six the team records go or no-go.

**Blocked by:** None (can start immediately). Reads the log's CREATE2 address; before log-contract 06 lands the slots read zero, which is fine.

**Ethskills:** tools, frontend-playbook, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Helios 0.12.0 runs in the browser on Sepolia with a pinned weak-subjectivity checkpoint and an editable consensus endpoint.
- [ ] The Anon-RPC browser-harness 0.4.0 worker is bootstrapped through Helios and its hash is checked against the light client; a `globalThis.fetch` shim sends Helios's execution RPC URL through the worker.
- [ ] Tor specifier by default, Nym selectable; the passthrough specifier is absent from the build and the page shows which transport served the read.
- [ ] The page prints proven values of slots 2 and 3 at the log's address and the header they were proven against.
- [ ] Hour-6 go or no-go recorded in this ticket's Comments. If no-go: Helios direct for proofs, worker for logs, ENS, and broadcast, and the fallback copy is written.
- [ ] No key, token, or keyed RPC URL in the repo; endpoints come from the environment.
