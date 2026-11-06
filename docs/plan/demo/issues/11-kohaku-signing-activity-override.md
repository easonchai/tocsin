# 11: Kohaku signing and activity surfaces, override, maintainer prompt

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 1: Kohaku module, surfaces and verdict panel; Testing decisions, manual checklist for Kohaku. PRD: `docs/spec/threat-flag-log.md`, Reader policy rule 9; Security Considerations, Liability.

**What to build:** The same reader answers on the signing surface (spender for approvals and permits, delegate for 7702 authorizations, the account's own delegate) and in the activity list (incoming sender and token contract). A `block` can be overridden locally after a short delay. A list whose maintainer changed prompts in settings instead of applying.

**Blocked by:** 10 (Kohaku module: background sync, send surface, settings, three beats)

**Ethskills:** frontend-ux, wallets, qa (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Signing surface: approve, permit, Permit2, and `setApprovalForAll` spenders evaluated in the spender context; EIP-7702 authorization delegates in the delegate context; the account's own code read through the verified state root and a `0xef0100` delegate evaluated as category 4.
- [ ] Activity list: incoming `tx.from` and token contract evaluated in the incoming-sender context; a category 8 sender shows `block` here and `warn` at the send screen.
- [ ] Override: `block` offers a local override control after a short delay; the override is stored locally and leaves no trace outside the extension.
- [ ] A list signed by a different maintainer is not applied; settings shows the conflict and asks; a stale record keeps the last verified version and is labelled stale.
- [ ] Manual checklist from the spec run and recorded in Comments: both transports, the override, the source switch, a stale list, a different-maintainer prompt, all three surfaces, fresh-install sync time.
