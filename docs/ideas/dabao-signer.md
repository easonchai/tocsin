# Tocsin on open silicon: a signer that checks Ethereum before it signs

Status: idea, not started. Separate from the Devcon 8 submission. Do not mention in the Devcon pitch.

## The hackathon

- CrossBar's Dabao Open Hardware Hackathon: https://crossbar-inc.com/pages/dabao-hackathon
- Board: Dabao, built on Baochip-1x (same silicon as CrossBar's Daric). VexRiscv RV32IMAC at 350 MHz with MMU, four PicoRV32 "BIO" I/O cores at 700 MHz, 4 MiB RRAM, 2 MiB SRAM, USB-C, crypto accelerators, TRNG, key store, glitch sensors, security mesh. 22 nm, IRIS-inspectable package. RTL and KiCad files published; some third-party IP closed.
- Board pickup: 3 to 6 Nov 2026 at the CrossBar Impact Space, Jio World Centre, Mumbai. Shipping afterwards is USD 20.
- Submissions close 15 Dec 2026, 21:00 ET. Winners 18 Dec. Prizes up to USD 5,000.
- Judged on four words: Works, New, Open, Uses the silicon. One link (repo, video, or write-up) that says which parts of the chip it uses.
- Judges: Mark Davis (CrossBar CEO), bunnie Huang (Baochip), third TBA. Lead the write-up with what runs on the silicon, not the chain.
- Tracks are an open brief. Ours is track 2, "Signing (Ethereum): an inspectable signer, clear-signing display, or passkey."
- Software: Xous (Rust microkernel, `cargo xtask dabao`, flash by copying a UF2 to the USB drive, USB serial console, VS Code plugin). BIO in RISC-V assembly or C via Zig, with BIO-sim and BIO-surfer.
- Links: baochip.com/dabao-intro, github.com/betrusted-io/xous-core, github.com/baochip/dabao, Discord discord.gg/KbDUUmDQn2.

## The narrative

Tocsin's reader today runs on the same OS the drainer runs on. The last trust gap is the device itself. Put the reader inside the signer:

> The first hardware signer that checks Ethereum itself before it signs, on silicon you can inspect under infrared.

Why it scores on their four criteria:

- **Open.** The ERC and reader are CC0. Their RTL is open. Nothing closed in the trust path except the third-party IP they already disclose.
- **New.** No signer checks an on-chain threat log today, let alone one it verified against a finalized header.
- **Uses the silicon.** Key store holds the signing key. Crypto accelerators do the hashing. Glitch sensors and the security mesh are the reason a verdict cannot be forced. The ERC-7730 clear-signing descriptor the draft already mandates maps straight onto the display.
- **Works.** The risk. See below.

## Design

Per transaction, on the device:

1. Parse the transaction, extract recipient and any token transfer target (ERC-7730 descriptor).
2. Verify a storage proof for `writerHead[w]` and `writerSeq[w]` of every writer on the device's pinned trust lists, against a cached finalized state root. Keccak and RLP only, a few kilobytes. Cheap.
3. Replay that writer's leaves (supplied by the host, untrusted) forward to the proven head. If the chain does not land on the head, show "unverifiable" and refuse to sign.
4. If the recipient is flagged by the configured threshold, show "Blocked" with the writers' names on the clear-signing display and refuse. Otherwise show the clear-signed transaction and ask for the physical confirm.

Once per sync-committee period (about 27 hours), on the device:

5. Verify the next finalized header from sync-committee signatures. This is the expensive step: one BLS12-381 aggregate over 512 validators, in software on a 350 MHz RV32 with no pairing accelerator. Expect seconds to tens of seconds. Acceptable once a day, not per transaction. Cache the header hash and state root in RRAM.

The host (phone or laptop) is a dumb pipe: it fetches headers, proofs, and leaves from any RPC and forwards them over USB. Nothing it sends is trusted until the device checks it.

Trust lists: pin the list roots on the device at setup. Updating a list is an owner action with physical confirm.

## The hard part, say it up front

BLS on the chip is the unknown that decides "Works."

- Need to confirm: does the Baochip-1x crypto block cover anything usable for BLS12-381 (field multiply, or only AES, SHA-2, P-256, Ed25519)? If only keccak and SHA are accelerated, the pairing is pure software.
- Budget check before committing: port a BLS12-381 verifier (blst or a no-std Rust implementation) to Xous and time one aggregate verification. If it is under a minute, the daily refresh design holds.
- Fallback if it is too slow: a pinned header the owner refreshes by physical confirm, with the device verifying only the storage proofs and replay. Honest, but the trust root moves back to the owner's judgement. Say which design is shipped in the write-up, never blur it.

Also unknown: whether the Dabao board carries a display or one must be added over the BIO cores. A small SPI display driven from BIO is itself a "uses the silicon" point.

## Where it touches CROPS

Not in the Devcon submission. It dilutes "your wallet checked Ethereum itself."

Long term it belongs under Security and the walkaway test in the ERC's security considerations, one sentence: an inspectable signer with the reader on-device closes the "but the host OS is trusted" objection, and IRIS inspection makes the hardware root of trust auditable without the vendor.

## Sources

- https://crossbar-inc.com/pages/dabao-hackathon
- bunnie's Baochip-1x post: https://daily.dev/posts/baochip-1x-a-mostly-open-22nm-soc-for-high-assurance-applications-bunnie-s-blog-yu4eixy7p
- Adafruit on the Dabao board: https://blog.adafruit.com/2026/03/04/dabao-board-features-open-source-hardware-baochip-1x-risc-v-mcu/
- DEF CON 34 badge on Baochip-1x: https://www.techtimes.com/articles/322671/20260802/def-con-34-badge-features-first-verifiable-open-source-silicon-production-scale.htm
