/* eslint-disable @next/next/no-img-element -- static export, and the port keeps site/index.html's plain <img> */
import { LandingScripts } from "./_components/LandingScripts";
import type { Metadata, NextPage } from "next";
import { SiteHeader } from "~~/components/SiteHeader";
import "~~/styles/landing.css";
import "~~/styles/scenes.css";

// Port of site/index.html. The demo links point at /demo in this app instead of tocsin-eth.vercel.app.
const TITLE = "Tocsin. Scam addresses, verified on chain.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description:
    "Scam prevention infrastructure on Ethereum. Writers flag drainers, phishing contracts and mule wallets to an append-only log; your wallet proves it with a light client and checks every recipient before you sign.",
  alternates: { canonical: "https://tocsin.eth.limo/" },
  openGraph: {
    title: TITLE,
    description:
      "Scam prevention infrastructure on Ethereum. Flags on an append-only log, proven by a light client in your wallet, checked before you sign.",
    images: ["https://tocsin.eth.limo/og.png"],
  },
  twitter: { card: "summary_large_image", title: TITLE, images: ["https://tocsin.eth.limo/og.png"] },
};

const Landing: NextPage = () => {
  return (
    <>
      <canvas id="field" aria-hidden="true"></canvas>

      <SiteHeader>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#lists">Trust lists</a>
          <a href="#use">Wallets</a>
          <a href="https://github.com/easonchai/tocsin">GitHub</a>
        </div>
        <a className="btn signal" href="/demo">
          Open the demo <span className="arrow">↗</span>
        </a>
      </SiteHeader>

      <header className="hero" id="top">
        <div className="left">
          <h1 className="rv">Scam addresses, verified on chain.</h1>
          <p className="tag rv d1">Flagged on an append-only log. Proven by your wallet. Checked before you sign.</p>
          <div className="ctas rv d2">
            <a className="btn signal" href="/demo">
              Open the demo <span className="arrow">↗</span>
            </a>
            <a className="btn" href="#how">
              How it works
            </a>
          </div>
          <div className="label nums rv d2">
            117 flags on Sepolia · 3 trust lists on ENS · 1 storage proof per check · 0 servers asked
          </div>
        </div>
        <div className="right">
          <div className="term" id="term">
            <div className="term-bar">
              <span className="dot live"></span>
              <span>wallet · send 48,000 USDC</span>
              <button className="replay" id="replay">
                replay
              </button>
            </div>
            <div className="term-body" id="term-body"></div>
            <div className="term-foot" id="term-foot"></div>
          </div>
        </div>
      </header>

      <section className="statement">
        <div>
          <div className="label">Verified, not trusted</div>
          <h2>
            Scam prevention infrastructure on Ethereum. No company in the middle, no account, no API key, and nobody
            learns who is asking.
          </h2>
        </div>
      </section>

      <section id="how" className="sec">
        <div className="sec-head">
          <div className="label">01 · How it works</div>
          <h2>Flag it. Prove it. Replay it.</h2>
          <p className="lede">
            A writer records a scam in the log. Your wallet proves what the log says and replays every flag on the
            device. The RPC is never asked who to trust.
          </p>
        </div>
        <div className="trio">
          <div className="rv">
            <div className="label">01</div>
            <div className="pic">
              <div
                className="frame"
                data-scene="append"
                aria-label="Writers append leaves into their own chains in the log"
              ></div>
            </div>
            <h3>Flag</h3>
            <p>
              Someone pays a drainer. A writer records it in the log under its own name. The contract hashes it into
              that writer&apos;s chain, where nothing can be removed.
            </p>
          </div>
          <div className="rv d1">
            <div className="label">02</div>
            <div className="pic">
              <div
                className="frame"
                data-scene="prove"
                aria-label="The wallet proves a head and replays leaves to it"
              ></div>
            </div>
            <h3>Prove</h3>
            <p>
              Your wallet&apos;s light client verifies a finalized block. One storage proof against it gives the head of
              every writer you follow. No RPC is trusted.
            </p>
          </div>
          <div className="rv d2">
            <div className="label">03</div>
            <div className="pic">
              <div className="frame" data-scene="lie" aria-label="A lying RPC is caught by a chain mismatch"></div>
            </div>
            <h3>Replay</h3>
            <p>
              The flags come from anywhere, even a lying mirror, and get replayed on the device. They land on the proven
              head or the wallet says unverifiable, never clean.
            </p>
          </div>
        </div>
      </section>

      <section id="lists" className="sec">
        <div className="sec-head">
          <div className="label">02 · Trust lists</div>
          <h2>Writers flag under their own name. You choose which names to trust.</h2>
          <p className="lede">
            Each list is an ENS name with a weight. Independent writers add up; mirrors of the same feed count once.{" "}
            <a className="more" href="/claim">
              Claim a name ↗
            </a>
          </p>
        </div>
        <div className="trio">
          <div className="rv">
            <div className="label">01</div>
            <div className="pic">
              <div className="big">
                255<small>weight · blocks alone</small>
              </div>
            </div>
            <h3 className="name">core.tocsin.eth</h3>
            <p>
              The Tocsin team. Hand-checked drainer receivers, poisoning operators and malicious delegates, each with
              on-chain evidence.
            </p>
          </div>
          <div className="rv d1">
            <div className="label">02</div>
            <div className="pic">
              <div className="big">
                255<small>weight · blocks alone</small>
              </div>
            </div>
            <h3 className="name">blockaid.tocsin.eth</h3>
            <p>A security vendor writing under its own key. Its flags count once, however many feeds mirror them.</p>
          </div>
          <div className="rv d2">
            <div className="label">03</div>
            <div className="pic">
              <div className="big">
                1<small>weight · needs a second writer</small>
              </div>
            </div>
            <h3 className="name">scamsniffer.tocsin.eth</h3>
            <p>Phishing researchers. Low weight on its own, decisive when it agrees with another independent writer.</p>
          </div>
        </div>
      </section>

      <section id="use" className="sec">
        <div className="sec-head">
          <div className="label">03 · Use it</div>
          <h2>Any wallet. Same log. Your lists.</h2>
          <p className="lede">
            Tocsin is a contract, a reader and a spec. There is no official wallet. Any wallet that runs the reader gets
            the same verdicts from the same log, and picks its own lists.
          </p>
        </div>
        <div className="cards">
          <div className="card rv">
            <h3>MetaMask Flask Snap</h3>
            <p>
              Transaction insights on every send: the verdict, the category, who flagged it and the evidence, computed
              on your device.
            </p>
            <div className="shot">
              <img
                src="/screens/raw/snap-block.jpg?v=3"
                alt="Tocsin insight in MetaMask Flask: Blocked, drainer receiver"
                style={{ transform: "translateY(-37%)" }}
              />
            </div>
            <a className="more" href="/demo">
              Install ↗
            </a>
          </div>
          <div className="card rv d1">
            <h3>The demo on Sepolia</h3>
            <p>
              Six scenarios. Pick one, watch the explainer trace the verdict while your own wallet pops up and blocks
              the send.
            </p>
            <div className="shot">
              <img src="/screens/demo-page-final.png" alt="The Tocsin demo page" />
            </div>
            <a className="more" href="/demo">
              Open ↗
            </a>
          </div>
          <div className="card rv d2">
            <h3>The spec</h3>
            <p>
              Leaf encoding, trust-list encoding, the reader policy and the light-client read procedure. Nothing else.
            </p>
            <div className="shot text">
              <b>log</b> · one contract, append-only, a chain per writer
              <br />
              <b>reader</b> · head proof, replay, verdict
              <br />
              <b>lists</b> · ENS text records with a weight
              <br />
              <b>proof</b> · 5 to 8 kB against a finalized root
              <br />
              <b>license</b> · CC0
            </div>
            <a className="more" href="https://github.com/easonchai/tocsin/blob/main/docs/spec/threat-flag-log.md">
              Read ↗
            </a>
          </div>
        </div>
      </section>

      <section id="leaks" className="sec">
        <div className="sec-head">
          <div className="label">04 · What leaks</div>
          <h2>Nothing leaves your device.</h2>
          <p className="lede">
            A label served from an API is trusted on the server&apos;s word, and the server learns who asked. A head
            proven against a finalized state root, with every flag replayed locally, tells nobody anything.
          </p>
        </div>
        <div className="leaks">
          <div className="proof rv">
            <div className="row leak">
              <span>per-address proof</span>
              <b>leaks the recipient</b>
            </div>
            <div className="row leak">
              <span>vendor API call</span>
              <b>leaks everything</b>
            </div>
            <div className="row">
              <span>per-writer head proofs + full sync</span>
              <b>leaks only which lists you use</b>
            </div>
            <div className="row">
              <span>proof size</span>
              <b>5 to 8 kB</b>
            </div>
            <div className="row">
              <span>a year of flags, 50k leaves</span>
              <b>under 1 MB gzipped</b>
            </div>
          </div>
          <div className="phone rv d1">
            <img
              src="/screens/raw/snap-block.jpg?v=3"
              alt="Tocsin insight in MetaMask Flask: Blocked, drainer receiver"
            />
          </div>
        </div>
      </section>

      <section className="sec quote">
        <div className="sec-head">
          <div className="label">Sovereign Infrastructure Hub · Devcon 8</div>
          <h2>“Nobody wants a light client. People want their wallet to stop trusting a company.”</h2>
        </div>
      </section>

      <section id="faq" className="sec">
        <div className="sec-head">
          <div className="label">05 · Questions</div>
          <h2>What people ask.</h2>
        </div>
        <div className="rows rv">
          <div className="r">
            <span className="q">Can a scammer remove their own flag?</span>
            <p>
              No. Nothing is ever removed, not by the writer, not by the subject, not by us. Corrections are new leaves.
              A reader that stops believing a writer drops the writer, and the record stays.
            </p>
          </div>
          <div className="r">
            <span className="q">Isn&apos;t this just Etherscan with extra steps?</span>
            <p>
              On day one, almost. The difference is that the record is public, forkable and verifiable, any wallet can
              pick a different list, and no curator can erase another writer&apos;s flag. Year two has two curators.
              Etherscan never will.
            </p>
          </div>
          <div className="r">
            <span className="q">Can&apos;t someone fake a list and a head? Hashing is cheap.</span>
            <p>
              A fake head is worthless because the wallet never accepts a head from anyone. It reads the head out of
              Ethereum&apos;s state under a storage proof checked against a finalized block its light client verified.
              To pass, an attacker would have to forge Ethereum finality.
            </p>
          </div>
          <div className="r">
            <span className="q">What about fresh lookalike addresses?</span>
            <p>
              We don&apos;t chase them. About 1 in 9,000 is ever paid and they land within minutes. A local prefix check
              against your own history catches them. Tocsin flags the operator that planted the dust, so every chain
              that operator works on is covered.
            </p>
          </div>
          <div className="r">
            <span className="q">Does this remove trust, or just move it?</span>
            <p>
              It removes the trust you never agreed to. Gone: the RPC, the vendor API, the mirror, the log operator.
              Kept: Ethereum&apos;s finality, which you already trust, and the writers you chose to follow. The log
              proves what a writer said. Whether to believe the writer stays your call.
            </p>
          </div>
          <div className="r">
            <span className="q">Who pays in year two?</span>
            <p>
              A flag costs about 10,000 gas, so a year of 50,000 flags is a few hundred dollars at current mainnet fees,
              and writer-signed batches let any grant or relayer pay. The reader cost is a few megabytes a year. This is
              a public good, not a company.
            </p>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-row">
          <a className="wordmark" href="#top">
            <span role="img" aria-label="bell" style={{ fontSize: "1.05em", lineHeight: 1 }}>
              🔔
            </span>
            tocsin
          </a>
          <div className="foot-links">
            <a href="/demo">Demo</a>
            <a href="https://github.com/easonchai/tocsin">GitHub</a>
            <a href="https://t.me/tocsin_eth">Telegram</a>
            <a href="https://x.com/tocsin_eth">X</a>
            <a href="/claim">Claim a name</a>
            <a href="#top">Top</a>
          </div>
        </div>
        <p className="note">
          Built at Devcon 8 and ETHGlobal Mumbai, November 2026. The log is on Sepolia, the names resolve through ENSv2,
          and the spec is CC0. Nobody is in charge of the log itself.
        </p>
      </footer>

      <LandingScripts />
    </>
  );
};

export default Landing;
