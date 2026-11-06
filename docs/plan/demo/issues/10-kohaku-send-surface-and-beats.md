# 10: Kohaku module: background sync, send surface, settings, three beats

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 1: Kohaku module; Success criteria; Judge checks, Anon-RPC and ENSv2. `docs/wallet-integrations.md`, Kohaku module. HANDOFF step 6.

**What to build:** A Kohaku user pastes a flagged drainer receiver into the send screen and the wallet blocks it, naming the writer, category, and evidence. The settings page shows the pinned lists, the Helios checkpoint age, the transport, and a source switch. With the switch on the lying proxy the wallet says `unverifiable, chain mismatch at sequence N`; on the mirror the block returns. All three beats on Tor and again on Nym.

**Blocked by:** 02 (Kohaku decision recorded as go), 07 (Three beats at the command line), 08 (ENS lists on Sepolia)

**Ethskills:** frontend-ux, frontend-playbook, wallets, qa (per AGENTS.md; load before starting)

**Status:** wontfix

- [ ] Module added on top of the fork with Ambire unmodified. Proof source is Kohaku's Helios header; fetch goes through Kohaku's transport, or through the harness bootstrap from ticket 01 if ticket 02 found the transport is not Anon-RPC.
- [ ] Background sync on every new finalized header; evaluated set and checkpoints in extension storage; a fresh install syncs both default writers and shows a verdict in under thirty seconds.
- [ ] Send surface evaluates the recipient; the verdict panel shows the writer's verified name or shortened address, operator label, category name, evidence link on click only, and the spec's framing of what the chain proves versus whose judgement applies. `clean` only when every pinned writer synced.
- [ ] Settings page: pinned lists by ENS name with maintainer, Helios checkpoint age, consensus endpoint, transport specifier in use, leaf source switch between RPC and each entry's `snapshotURI`. The passthrough specifier is absent from the build.
- [ ] Three beats pass at a rehearsal on Tor and on Nym, on the venue network or the hotspot, recorded in Comments.
- [ ] Frontend-ux completeness on every surface drawn: product identity, no framework defaults, fiat context where an amount shows, errors in plain words next to the action, theme tokens; build and typecheck pass with Sepolia as the configured chain.

## Comments

- 2026-11-06: Not built. Ticket 02 recorded Snap primary with Kohaku as a diagram. A Kohaku module cannot hook send, signing, or activity without editing Ambire files, and Kohaku on Sepolia runs neither Helios nor Anon-RPC by default. The three beats move to the Snap (ticket 12); ticket 13 becomes active per the cut lines.
