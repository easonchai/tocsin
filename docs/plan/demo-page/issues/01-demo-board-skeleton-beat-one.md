# 01: Demo board skeleton on Sepolia: connect, Install Snap, RPC boxes, clean and drainer rows

Spec: `docs/plan/demo-page/spec.md`. Demo address table: `docs/plan/demo/test-addresses.tsv`. Servers: `docs/plan/demo/runbook.md`, "Servers on the demo laptop".

**What to build:** The presenter opens the home page, connects MetaMask with the Snap (or Kohaku), and presses "drainer receiver". The wallet blocks it. Pressing "clean" opens the wallet and it passes. The poison and honest RPC URLs sit at the top with copy buttons. Beat one runs from a button.

**Blocked by:** None (can start immediately)

**Ethskills:** frontend-ux, frontend-playbook, qa (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] Scaffold target network is Sepolia only. Build and typecheck pass. Debug Contracts still lists the log.
- [ ] Home page body is the demo board. Header links unchanged. Existing connect button present. Kohaku appears in the connect dialog through EIP-6963; if it does not, a plain injected connector is added and recorded in Comments.
- [ ] Install Snap button installs the Snap from the local dev server through the Snap install RPC. Clicking it twice does not error.
- [x] Two read-only RPC boxes, poison `http://127.0.0.1:8550` and honest `https://0xrpc.io/sep`, each with a copy button, and the line "paste into the Snap or Kohaku RPC setting".
- [x] One constants module holds the scenario table with the row shape from the spec (title, group, subject label, address, lists, category name, expected verdict, `snapOnly`, optional note) and two Send ETH rows: clean to the demo account, and drainer-receiver-1 with the poison RPC note.
- [x] Rows render under a group heading with badges for list names, category and expected verdict, and the note under the row. Fixed amount, no input fields.
- [x] Each button builds an ETH send and submits it through wagmi to the connected wallet. The page does no address evaluation and no list reads.
- [ ] Rehearsed with the Snap on Sepolia: drainer-receiver-1 blocks, clean passes. With the poison RPC pasted into the Snap, drainer-receiver-1 shows unverifiable, chain mismatch at sequence 1. Recorded in Comments.
- [x] Frontend-ux completeness: product identity, theme tokens, no framework defaults left in the body, errors in plain words beside the button.

## Comments

- 2026-11-06: Built in `dapp/packages/nextjs`. Scaffold targets Sepolia only, and `rpcOverrides` sends Sepolia reads to `https://0xrpc.io/sep` so receipts don't ride the bare public fallback. Debug Contracts reads the existing 11155111 entry in `deployedContracts.ts`. The burner wallet is gone because Scaffold only shows it on local chains.
- The scenario table is `utils/demo/scenarios.ts`, one object per row. `buildTx` encodes the call with viem. The page sends it through wagmi's wallet client inside `useTransactor`, with the chain pinned to Sepolia, and does no lookups. ETH rows send 0.00001 ETH. Each row's button is always the next step: Connect wallet, then Switch to Sepolia, then Send. A rejection or error shows in plain words under the button.
- EIP-6963: RainbowKit 2.2.11 lists wagmi's EIP-6963 connectors in an "Installed" group (`isEIP6963Connector` in its `dist/index.js`). wagmi 2.19.5 has `multiInjectedProviderDiscovery` on by default, and nothing here turns it off, so I added no injected connector. One catch: RainbowKit drops an announced wallet whose icon isn't a `data:image` URI. I had no Kohaku build to try, so box 2 stays open until someone opens the connect dialog with the fork installed. If Kohaku is missing, check its EIP-6963 icon before adding a connector.
- Install Snap calls `wallet_requestSnaps` for `local:http://localhost:8080` (the port in `snap.config.ts`) on the connected wallet's provider. The button is disabled while a request is open, so a double click can't hit MetaMask's "request already pending". MetaMask answers a repeat request for an installed Snap without an error. I couldn't try it in Flask, so box 3 stays open for that check.
- Product identity: the tab title, title template, description and header brand text now say Tocsin. The footer's BuidlGuidl links, the SE-2 logo and the favicon are still the scaffold's. They sit outside the body.
- Spec conflict: the spec says the header keeps Debug Contracts and Block Explorer, but before this ticket the header had only Home and Debug Contracts. I left it unchanged, as the box asks.
- Checked: `next:check-types`, `next:build` (lint then build) and the constants test pass. I opened the production build in Chrome with no wallet. There were no console errors, a row button opened the RainbowKit modal, and Install Snap showed its "connect first" message.
- Needs a human: the box 8 rehearsal in MetaMask Flask with the static site, the Snap dev server and the lying proxy running. Also Kohaku in the connect dialog (box 2) and Install Snap clicked twice in Flask (box 3).
