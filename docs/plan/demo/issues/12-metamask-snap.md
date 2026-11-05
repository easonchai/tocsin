# 12: MetaMask Snap

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 2: MetaMask Snap; Judge checks (the Snap does not claim Anon-RPC). `docs/wallet-integrations.md`, MetaMask Snap.

**What to build:** A user installs the Snap in a clean MetaMask, pastes a flagged drainer receiver, and sees the panel block it before the confirm button, naming writer, category, and evidence and stating that verification is best-effort because the header comes from an RPC. A permit for a flagged spender gets the same treatment at signing. Without the Snap the same address shows nothing.

**Blocked by:** 07 (Three beats at the command line), 08 (ENS lists on Sepolia)

**Ethskills:** frontend-ux, wallets, tools, qa (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] `@metamask/snaps-sdk` 12.1.0 and `@metamask/snaps-cli` 8.4.1 with only the permissions the spec lists; versions re-checked on npm before install and a change flagged, not substituted.
- [ ] `onTransaction` evaluates `to` and the decoded spender, recipient, or operator of ERC-20 `approve`, `transfer`, Permit2, and `setApprovalForAll`; `onSignature` evaluates the spender in EIP-2612 and Permit2 typed data.
- [ ] Sync on install and on the cronjob; evaluated set, checkpoints, and pinned lists in Snap state; proof and leaf sources fetch a user-configurable RPC with a public default and the panel says the header is unverified.
- [ ] Severity drives MetaMask's own warning styling; a changed maintainer opens a confirmation dialog; `clean` only when every pinned writer synced.
- [ ] Acceptance in a clean MetaMask recorded in Comments: install, block before confirm, permit block at signing, the same address clean without the Snap, the maintainer-change dialog.
- [ ] If ticket 02 recorded Kohaku as failed, the three beats run here with the source switch in the Snap's settings dialog, and the submission shows Kohaku as a diagram.
