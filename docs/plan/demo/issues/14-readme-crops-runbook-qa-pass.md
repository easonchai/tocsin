# 14: README CROPS section, demo runbook, fresh-reviewer QA pass

Spec: `docs/plan/demo/spec.md`, Success criteria; Judge checks; Further notes, who pays. README, CROPS section. Ship ethskill, Minimal ship checklist, last item.

**What to build:** A judge reads the README and every CROPS claim matches what the shipped hosts do; someone with a fresh clone and the env file runs seed, relayer, detector, proxy, and mirror from the runbook; and a reviewer who did not build the primary host runs the qa checklist against it before the final rehearsal.

**Blocked by:** 09 (Detector), and whichever of 10 (Kohaku) or 12 (Snap) is the primary host per ticket 02

**Ethskills:** crops, qa, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-human

- [x] README CROPS section rewritten against the shipped code: operator powers (none), what survives the team disappearing (log, pinned lists, every host), what an observer learns (no per-subject query leaves the device; which reads are anonymised per transport), and the trust level of each host as wallet-integrations states it.
- [x] Walkaway test performed and recorded: with the team's name and static host unreachable, the primary host keeps working from the pinned list and the log. Done offline against the built Snap bundle. The live run on Sepolia is ready-for-human, steps in the runbook.
- [x] Runbook: exact commands and environment variable names for seed, relayer, detector, proxy, and mirror, the three funded addresses and the faucet, no secret values.
- [x] Judge checks from the spec each mapped to where they are demonstrable, and the ENS prize line states whether the step-8 fallback triggered.
- [x] A fresh-context reviewer who did not build the primary host runs the qa ethskill checklist against it and the findings are recorded in Comments and fixed or accepted.

## Comments

- 2026-11-06: Boxes 1 to 4. Box 5, the qa pass, ran in parallel with a separate reviewer and is not covered here. Ethskills crops and concepts were loaded. Nothing in them conflicts with HANDOFF's settled decisions for this ticket.
  - README. The `## CROPS` section was rewritten from the code, not from the old text. Several old claims no longer held. Helios's consensus endpoint is not user-configurable in the extension, which fixes its RPCs at build time. "Every read over Anon-RPC" is true only of the extension in `tor` or `nym` mode. The extension fetches the list document at `listURI` directly, and the Snap sends every read directly to its RPC. The section now covers operator powers: none on the log, verified in `ThreatFlagLog.sol`, which has only `append` and `appendSigned`. It also names the off-contract powers, the ENS owner and the maintainer key, and notes that the EAC grant covers every name on the resolver. It covers what survives the team, a per-transport table of what each read reveals, each host's trust level, and the fact that nothing is live on Sepolia yet. The "What is here" table gained the runbook and the four dapp packages.
  - Walkaway test. The new `walkaway` test sits at the end of `dapp/packages/snap/test/bundle.test.ts` and runs against the built `dist/bundle.js`. After the earlier tests pin a list and sync, it flips one flag. Every `eth_call` to the Universal Resolver reverts, as if the name and its records were deleted, and `lists.test` and `mirror.test` refuse connections. It then switches the leaf source to RPC, which clears checkpoints, so the sync replays every leaf from the log. Assertions: the settings page shows the list as `stale` with the pinned maintainer, both writers are synced to sequence 2, the drainer receiver gets `severity: "critical"` with "Drainer receiver", the panel does not say "uses the sync before it", so this is a fresh sync and not a cached one, and the writer shows as `0x0000…11cE` because its reverse name is gone. `yarn workspace @tocsin/snap test`: 29 of 29 passed on the first run. After the reviewer's concurrent edits to `snap/src`, a rerun passed 31 of 31. `yarn workspace @tocsin/snap check-types` exits 0. The extension takes the same fallback path in `fetchList` in `src/engine.ts` but has no test of its own for it.
  - Runbook: `docs/plan/demo/runbook.md`, linked from the README. It covers keys and roles with funding, the faucet, every ignored env file and the variable names it holds, and then deploy, seed, list fill and sign, mirror, ENS setup and publish, relay, detect, lying proxy, the eval beats, Snap build, test and serve, extension build and test, the harness page, the live walkaway steps, and the judge-check table. Each command was checked against the `scripts` in its `package.json`. Paths passed to `publish-list` use `$PWD/../site/...`, because yarn runs workspace scripts from the package directory. `ens-publish` reads the record from stdin with `-`. The seeded subject addresses were recomputed from the seed labels with viem. The drainer spender `0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e` is new to the docs. No key, keyed URL, or secret appears.
  - Funded addresses. The spec names three: the manual writer, the relayer, and the demo account. The runbook also lists the deployer, the ENS owner, and the maintainer, which need gas per log-contract 06 and ticket 08. The detector stays unfunded.
  - ENS prize. The fallback did not trigger: ENSv2, the permissioned resolver, and EAC are live on Sepolia (ticket 08 Comments). This ticket calls it the step-8 fallback. The spec calls it the step-4 fallback, and both mean the plain text record. The prize stays claimable once `ens-setup` runs live. So far it has only been rehearsed on a fork.
  - Judge checks that moved hosts. The spec puts the Anon-RPC and Helios `eth_call` checks in Kohaku. Ticket 02 dropped Kohaku, so the table maps them to the extension and the `/harness` page. The extension has never run in a browser (ticket 13), so its rows say pending.
  - Not verified: anything on Sepolia, and anything in a browser. The runbook commands were checked against `package.json`, but only the Snap test and type check were run. The yarn cwd behaviour the `$PWD` paths rely on was confirmed: `yarn workspace @tocsin/reader run tsx -e "console.log(process.cwd())"` prints `dapp/packages/reader`.
  - Ready-for-human:
    1. After log-contract 06, demo 06, 08, and the static host are live, run runbook step 10, the live walkaway, in the Snap and then in the extension. Record the "Last check: stale" row and the block panel here.
    2. Pick the static host for `site/` and confirm it sends `access-control-allow-origin: *`.
    3. Once the name is registered and the log deployed, reread the README CROPS section and drop the "not yet deployed" sentence.
- 2026-11-06: Box 5, qa pass. A reviewer who built neither host ran the qa checklist against the Snap first and then the extension, with the qa and concepts ethskills loaded. It found no conflict with HANDOFF. After the fixes, the Snap passes 31 of 31 tests and the extension 20 of 20, and both typecheck. Each fix has a test that failed on the old bundle, except the `offscreen.ts` changes, which only run inside Chrome. Findings, most severe first:
  1. High, fixed. In the extension, `src/page-entry.ts` built request ids with `crypto.randomUUID()`, which doesn't exist on plain-http pages, so every held request threw there. Ids now come from `crypto.getRandomValues`, and there's a test.
  2. Medium, accepted. Any page script can read a held request's id and post its own `proceed: true` over `window.postMessage`. That fits ticket 13's limit that a page written to beat the proxy can get around it. The recommended fix is a `MessageChannel` port handed over at document_start. Don't pitch the extension as stopping a page that targets it.
  3. Medium, fixed. The extension's overlay said all RPC traffic goes through the worker. It now says the list document and the light-client updates are fetched directly.
  4. Medium, fixed in the Snap. Off Sepolia, a drainer flagged only on Sepolia showed as clean with no reason given. The panel now names the request's chain. The extension draws nothing on a clean result, so there it is a demo rule: keep MetaMask on Sepolia.
  5. Medium, partly fixed. A failed extension boot never retries, and the message now says to reload the extension. A retry with backoff is recommended.
  6. Medium, accepted. In `reader/src/rpc.ts` a proof block counts as finalized only when `latest <= finalized`, which never holds on a live chain. So neither host writes a checkpoint and every sync replays from the start block. This fails safe and is cheap while the log is new, and both builds now warn when `TOCSIN_LOG_FROM_BLOCK` is unset. Proving at the `finalized` tag would delay new flags by about two epochs, so changing that is a reader design call left open.
  7. Low, fixed:
     - The Snap showed a sync's source error only after the settings page was reopened.
     - The warn banner wording was not always true.
     - The manifest asked for the transaction and signature origin, which no code reads. Both are now off and the shasum was regenerated.
     - While starting, the extension said it could not check requests that have no target.
     - The Snap's settings page now shows the log contract and chain.
  8. Low, accepted:
     - The Snap shows a shortened address only.
     - The Snap doesn't show how old a sync is.
     - The Snap's source dropdown says "Custom URL (lying proxy)".
     - A cron sync and a settings sync can race. It is already marked `shortcut:`.
     - The extension keeps the old pin on a maintainer change instead of prompting.
     - The extension's unavailable copy differs from the spec string, which doesn't matter since beat 2 is Snap-only.
     - The extension leaves legacy `send` and `sendAsync` unwrapped and doesn't cover iframes.
  - The qa checks that don't apply to these hosts: connect button, switch-network button, approve flow, scaffold hooks, theme, layout branding, polling, and mobile wallets.
  - Ready-for-human, on top of the three items above:
    1. Rehearse beat 2 in the Snap first. Chrome may block the Snap's fetch to `http://127.0.0.1:8550`, and the lying proxy sends no `Access-Control-Allow-Private-Network` header. If it fails, put the proxy behind an https tunnel.
    2. In MetaMask Flask, check:
       - The insight tab and its critical styling.
       - That the user has to acknowledge before Confirm on a block.
       - That cron runs every 5 minutes.
       - The maintainer-change dialog.
       - That the install dialog no longer lists origin access.
    3. Time a fresh-install sync with `TOCSIN_LOG_FROM_BLOCK` set, against the 30 s target and MetaMask's per-request limit.
    4. In real Chrome, check that the extension's offscreen CSP allows the wasm, the Anon-RPC sandbox runs, and Tor and Nym start. Also check the plain-http fix and the EIP-6963 path. Check overlay contrast and keyboard use too.
    5. Don't commit a Snap manifest built with private `TOCSIN_*` settings.
    6. Refresh the Helios checkpoints in `anonHelios.ts` if the demo slips past about 19 November.
    7. Decide whether finding 2 changes what the pitch says about the extension.
