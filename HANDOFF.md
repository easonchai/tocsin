# Tocsin, working state as of 6 November 2026

Read this first if you are picking the project up. Everything that matters is in this repo; nothing depends on a chat log.

## What exists

- The ERC draft, `erc/eip-draft_threat_flag_log.md`. Version two. It has been through an eight-lens review against the ethskills guides and the EIP-1 format. The reference implementation in its last section compiled and passed nine Foundry tests covering normative cases 1 to 9 on 5 November. The Solidity files are deliberately not in the repo yet; extract the reference section into a Foundry project when you start the contract work.
- The site, `site/`. Static, fonts bundled, no external requests. `site/erc.html` is generated from the markdown by `scripts/build-erc.mjs`.
- The PRD, a Claude Doc: https://claude.ai/artifact/6zCRXmy9mmdUBX9okV4nCY. It predates the review and still mentions Chainlink CRE, which we dropped.

## Decisions that are settled

- Trust first, privacy second, security is the outcome. Say "verifiable", not "trustless". Never say "composable" (no contract can query the log). Never say "decentralised ScamSniffer" (we replace distribution and trust, not detection).
- ERC-8004 gets one sentence in Related work and nothing in the pitch.
- Read path: prove per-writer heads at storage slots 2 and 3, sync only the pinned writers' entries from any source, verify the suffix from an anchor, never replay from a writer's first entry. The global head at slot 0 is for mirrors.
- Trust lists are EIP-712 signed by a maintainer. ENS locates a list; the signature authenticates it. Readers pin maintainer and version on first use. ENSv2 roles govern who may publish the record, not who may write the log.
- The log has no access control. Writer is `msg.sender` or the EIP-712 or ERC-1271 signer. Anyone writes into their own namespace.
- Gas: about 10,000 gas per flag batched, event-dominated, under half a cent at this week's median. Say "about half a cent a flag". Glamsterdam calldata repricing is noted in the Rationale, not acted on.
- `chainId = 0` only for categories 1, 2, 6. Category 1 is the authorizer (4337 sender), never the bundler. Category 4's subject is the address after the `0xef0100` designator.
- Blob mode removed to a later ERC. A Bloom-filter mode for very large writers and a state-storage fallback for data availability were discussed and not written.
- No Chainlink CRE. The automated writer is a plain detector script with its own key, listed at warn weight.
- Deploy with CREATE2 through `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt zero, on Sepolia and mainnet so the address matches. Append two or three real mainnet flags before judging.
- Anon-RPC host (6 Nov): upstream Kohaku does not route reads through Anon-RPC, so our patch adds it for Tocsin's reads only (`dapp/packages/kohaku`, an offscreen document with the tor-js worker, hash verified through mainnet Helios). The Kohaku module is the Anon-RPC prize entry; the provider-proxy extension is the fallback, since it meets the same rule. Kohaku's own balance, gas and simulation reads still go direct.

## Brand (in progress, 6 Nov)

Direction is settled and written in `design/DIRECTION.md`: dark, still until touched, one amber accent, the background is the system's state (borrowed from the Devcon ENS page), a bell reduced to its ring as the mark, the live background is a dot field where strikes send rings outward and struck regions stay faintly brighter. Mark explorations are in `design/explorations/marks.html` and `design/explorations/marks-a.html` (serve the repo root and open them; fonts resolve from `/site/fonts/`). Eason chose direction A (bell as its sound) and then A2: three nested bell curves on one lip with a strike dot. Each curve is a cast-bell profile built from four cubic Béziers (round dome with a horizontal tangent at the apex, shoulder at 0.62 of the half-width and 0.50 of the height, concave flare landing tangent on the baseline), scaled 1, 0.64, 0.32 about the centre on a 24 grid with the baseline at y 17.5. A plain Gaussian and a generalised normal were both tried and rejected as too pointy. The 16px favicon uses the outer two curves only. Paths live in `design/explorations/marks-a.html` until the kit exports them. Reference screenshots of ens.domains, devcon.ens.domains, and railgun.org are in `~/.playwright-mcp/tocsin-refs/`.

The kit is built under `design/kit/` and the site runs on it (serve the repo root and open `design/kit/index.html`, `design/kit/scenes.html`, `design/kit/mocks.html`, `site/index.html`):

- `design/kit/tokens.css` is the only place colours, type, and motion durations live; `site/style.css` imports it. The primary button is paper, not amber, so the one amber per screen stays free for the highlighted word or the proof path. `.btn.signal` exists for a screen with no highlighted word.
- `design/kit/mark.svg`, `mark-light.svg`, `favicon.svg` (two curves, stroke 2.2), `icon.svg` (512, radius 112). Pages inline the mark as an SVG symbol with id `mark` and draw it in paper; amber on the mark is for the kit sheet and the app icon.
- `design/kit/ringfield.js` is the live background: the field breathes slowly, a strike sends a ripple through the dots (crest, two echoes, a trough) that decelerates and fades over four seconds, residue lets go over ten, the cursor carries a lens, and a blurred page-colour mask keeps copy clean. There is no drawn ring. `Tocsin.ringfield(canvas, {seed})` returns `strike(x, y)` and `setState(idle|syncing|verified|unverifiable|blocked)`. The landing page's trace drives it: syncing at start, verified after the replay line, blocked on the verdict with the strike at the verdict box's left edge, idle six seconds later.
- `design/kit/scenes.js` and `scenes.css` draw the three how-it-works loops (`append`, `prove`, `lie`) into any `[data-scene]` element; they replaced the old boxed diagram in section 02 of the site. Each is a four-beat story with a plain-word caption per beat (a victim pays, a writer records, the log keeps it, every wallet knows; you paste, the wallet asks Ethereum, replays the flags, blocks; the RPC lies, the real head is proved, a flag is missing, unverifiable). Beats are at 0.3, 2.8, 5.3, 7.8 seconds and the loop is 10.5 seconds.
- `design/kit/mocks.html` has the Kohaku send screen, the Snap insight panel, and the extension overlay. Host chrome is neutral grey; the Tocsin surface is the only thing with a voice. Reuse the `.tocsin` block as the spec for the real integrations.

Critic loop on the landing page: four rounds, 7/10 each time, hero rated 8.5 to 9 and the body 6, so the loop was stopped at the plateau. Applied across the rounds: trace grows line by line and keeps its closing line for the verdict, scenes replaced the boxed diagram, amber held to the headline word and the proof wire, stat band removed, trust table first with the Tocsin column on ink-800, section 06 frontmatter beside the headline, FAQ as open rows, quote at h2 size, residue brighter and 20s long, nav cut to four links. Still open from the critic, not done because each needs a decision or real data: a dated ledger of real incidents in place of the Devcon quote, a per-leaf record drawn in scene one, full-bleed trust table and ledger-style read path to break the section rhythm, scope chips as a two-column table. Still no Higgsfield.

## Prize targets, ETHGlobal Mumbai, submissions close 8 November 09:00 IST

- Ethereum Foundation, Best Use of Anon-RPC ($5k) as primary and Best CROPS App ($3.5k) as fallback. One EF prize per project; submit to both and the judges place us. The README has the required CROPS section.
- ENS, Best Use of ENSv2 ($7k). The list contract mounted as a subregistry, writers as subnames, a Permissioned Resolver record for the head, Enhanced Access Control for publishing roles. Read lists through Helios `eth_call` with CCIP-read off.
- Arkiv mirror ($4k) only if there is time; the wallet has to read from it, not just write.
- Submission form: name "tocsin", category Security, emoji 💉.

## Wallet integrations

Three hosts for one reader: a Kohaku module (EF privacy wallet, Ambire fork with Helios built in, so Ambire itself is never touched), a MetaMask Snap, and a provider-proxy browser extension in the Wallet Guard and Pocket Universe mould. Full spec, trust level of each, scope, and acceptance in `docs/wallet-integrations.md`. Kohaku first with a decision at hour three, Snap second, extension third.

### Kohaku state, 6 November

Done and verified on 6 November in a CLI-driven Chrome: all three beats, the service worker makes no direct RPC request during a sync, the gateway log shows the worker's WebRTC session and Tor tunnels, jest 30 of 30, and a fresh `setup.sh` clone applies both patches.

- Code lives in two patches under `dapp/packages/kohaku/patches/`; `setup.sh` clones upstream at the pinned commits, applies them, copies the reader and the Helios plus Anon-RPC helper in. Edit inside the clone, then `update-patches.sh`. The README has the full map.
- Tocsin's reads go through an offscreen document (`src/web/extension-services/tocsin-offscreen/`) that syncs a mainnet Helios, verifies the tor-js worker hash against the on-chain specifier, and boots `@anon-rpc/browser-harness`. The service worker relays fetches over a named port (`background/tocsinAnonRpc.ts`). `runtime.sendMessage` does not work here, Kohaku's own tab page answers first. The harness's isolation frame is `anon-boot.html`, a manifest sandbox page, because the extension CSP blocks the default inline frame.
- Localhost RPCs (lying proxy, list server) go direct. `TOCSIN_TRANSPORT=direct` in `.env` turns the worker off. Build settings are baked in; edit `.env` and rebuild.
- Demo on `build/webkit-prod` (`build:web:webkit`), never the watching dev build: its live-reload client reloads every page with Kohaku's content script, the demo dApp included.
- Start `tor-js-gateway` before loading the extension and wait for "TorClient bootstrapped". Debug in this order: the gateway log ("peer connection state changed: connected" on worker boot, "CONNECT: tunnel to" on every read); `chrome://extensions`, Kohaku, Inspect views `tocsin-offscreen.html` (boot stages and failures); the service worker console (`[BG] Tocsin Anon-RPC worker` on a boot failure). No status row in settings yet.
- Known flake: the first Tor sync after a boot sometimes fails with "request to 0xrpc.io failed". Press Sync now again. Publicnode's `eth_getProof` returns "block not found" about one time in six through the lying proxy; retry.
- Not done: Nym transport (the switch exists, untested in Kohaku), worker hash and boot stage in the settings page, the Snap's Policy section, the token-contract check, the curator lists, and whether Unverifiable should block Send (it does not today). Ticket 16 has the test record and ticket 17 the research.

## Build order, 48 hours, riskiest first

1. Hours 0 to 6. `@a16z/helios@0.12.0` in the browser on Sepolia. `@anon-rpc/browser-harness@0.4.0` worker bootstrapped through Helios so the worker hash is light-client verified. A `globalThis.fetch` shim for Helios's execution RPC URL so its reads go through the worker. Read slots 2 and 3 over tor-js (specifier `0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e`), Nym as fallback (`0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0`). Never the passthrough specifier on stage, it does not anonymise. Go or no-go at hour 6: fallback is Helios direct, Anon-RPC carrying logs, ENS, and broadcast.
2. Hours 6 to 12. CREATE2 deploy on Sepolia, seed about fifty entries, TypeScript reader that replays from an anchor per writer and applies a list.
3. Hours 12 to 18. The lying log proxy and a snapshot mirror. The demo has three beats: honest RPC blocks the drainer receiver; swap to the lying proxy and the wallet shows "unverifiable, chain mismatch at sequence N"; pull the same entries from the mirror, the chain matches the proven head, the block returns.
4. Hours 18 to 26. ENSv2 subnames and the list record through `@ensdomains/ensjs@5.2.12` (`wallet/v2`). The reader verifies the maintainer signature.
5. Hours 26 to 34. Detector script: dust transfer to operator flag with the 4337 sender rule, signed batch, relayer.
6. Hours 34 to 42. Send, sign (spender and 7702 delegate, including the user's own account), and receive screens.
7. Hours 42 to 48. Mainnet deploy, real flags, a PR adding the app to the Anon-RPC adopters file, the three-minute video, two rehearsals.

Packages the tools review pinned: viem 2.57.16, wagmi 3.7.11, create-eth 2.0.23 with `-s foundry`, forge 1.9.0 or newer. `@ethereumjs/mpt@10.1.3` only if you want an on-screen proof panel; Helios already verifies storage reads.

## Pitch

The 4-minute structure: problem (30s), the insight that memory beats detection (30s), the three-beat demo (90s), trust model and the Railgun line (45s), CROPS one letter at a time (30s), close (15s). Railgun already runs this trust model for its proof-of-innocence lists, off-chain, closed code, one key per provider; we are the on-chain half.

Questions to put to mentors: who would sign entries under their own key as the first writer; who keeps the 5 MB a year alive once nodes drop history, or do we pay nine times the gas to store entries in state; are signed lists enough, or will judges expect bonds and disputes.

## People to find at Devcon 8

The speaker on a shared evidence layer for on-chain crime (first writer or closest competitor, find out which). The address-poisoning evolution speaker (data for the backtest). The Kohaku, PIR, and verified-reads people (the EF side of the Anon-RPC prize). The author of the trustless log index proposal for Geth (cite it in the ERC). The ENSv2 irreversibility speaker (sanity-check the subregistry plan).

## Open items

- Replace the `discussions-to` TODO after the Ethereum Magicians post.
- Backtest before the ERC PR: share of lost dollars to addresses that met the write criteria at least an hour before the loss. Under 10 percent, stop; over 25 percent, build.
- The landing page's blind design critique plateaued around 7 of 10. Remaining asks are taste calls on the hero and the trace panel.
- Update the PRD to drop Chainlink CRE.
