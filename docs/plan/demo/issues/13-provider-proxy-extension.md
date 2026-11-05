# 13: Provider-proxy extension (conditional)

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Host 3: provider-proxy extension; Order and cut lines. `docs/wallet-integrations.md`, provider-proxy extension.

**What to build:** With the extension installed and MetaMask as the wallet, a send to a flagged address is stopped by an overlay before the MetaMask popup opens; a `warn` overlay continues on confirm; `unavailable` states why and continues. Built only if ticket 02 recorded Kohaku as failed and time remains, or after the hackathon.

**Blocked by:** 07 (Three beats at the command line), 08 (ENS lists on Sepolia), and ticket 02's decision recorded as Kohaku failed

**Ethskills:** frontend-ux, wallets, qa (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] Manifest V3; content script injects the provider proxy at document start, wrapping `window.ethereum` and every EIP-6963 provider; background worker runs the reader and sync, embedding the harness's Helios plus Anon-RPC from ticket 01.
- [ ] Passes everything through except `eth_sendTransaction`, `eth_signTypedData_v4`, and `wallet_sendCalls`; the three verdict behaviours as the spec states, with the override after a delay.
- [ ] Never stores, logs, or transmits the intercepted request; the overlay is the only output.
- [ ] Acceptance recorded in Comments: intercept before the MetaMask popup, each of the three verdict behaviours, nothing shown without the extension.
