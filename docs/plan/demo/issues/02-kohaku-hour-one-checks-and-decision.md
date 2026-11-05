# 02: Kohaku hour-one checks and hour-three decision

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 1: Kohaku module; Further notes, Kohaku unverified items. `docs/wallet-integrations.md`, Kohaku scope and Order and cut lines.

**What to build:** By hour three the team knows whether Kohaku is the demo wallet. The fork builds, runs on Sepolia, and its transport is identified; or it does not and the Snap becomes the primary host.

**Blocked by:** None (can start immediately)

**Ethskills:** tools, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] The Kohaku extension fork is cloned, builds, and loads in a browser within hour one, with the build command recorded in Comments.
- [ ] It runs against Sepolia with a test account; what had to change to get there is recorded.
- [ ] Whether its reads go through Anon-RPC, and whether it runs Helios, is recorded with evidence (the module or network trace that shows it).
- [ ] Hour-three decision recorded in Comments: Kohaku primary, or Snap primary with Kohaku as a diagram. Tickets 10, 11, and 13 read this decision.
- [ ] Ambire itself is unmodified; any change is in the module layer.
