import { ClaimScripts } from "./_components/ClaimScripts";
import type { Metadata, NextPage } from "next";
import { SiteHeader } from "~~/components/SiteHeader";
import "~~/styles/claim.css";

// Port of site/claim.html. The script lives in _components/claim.js and runs from ClaimScripts.
export const metadata: Metadata = {
  title: { absolute: "Claim your name under tocsin.eth" },
  description: "Own label.eth on ENSv2 Sepolia, claim label.tocsin.eth in one transaction. Nobody can take it back.",
};

const Claim: NextPage = () => {
  return (
    <>
      <canvas id="field" aria-hidden="true"></canvas>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <g id="mark">
            <g fill="none" stroke="#ece7dc" strokeWidth="1.4" strokeLinecap="square">
              <path d="M8.80 17.50C10.08 17.50 9.92 16.10 10.02 15.50C10.11 14.90 10.40 13.50 12.00 13.50C13.60 13.50 13.89 14.90 13.98 15.50C14.08 16.10 13.92 17.50 15.20 17.50" />
              <path d="M5.60 17.50C8.16 17.50 7.84 14.70 8.03 13.50C8.22 12.30 8.80 9.50 12.00 9.50C15.20 9.50 15.78 12.30 15.97 13.50C16.16 14.70 15.84 17.50 18.40 17.50" />
              <path
                d="M2.00 17.50C6.00 17.50 5.50 13.12 5.80 11.25C6.10 9.38 7.00 5.00 12.00 5.00C17.00 5.00 17.90 9.38 18.20 11.25C18.50 13.12 18.00 17.50 22.00 17.50"
                opacity=".5"
              />
            </g>
            <path d="M2 18.5h20" stroke="#ece7dc" strokeWidth="1.4" strokeLinecap="square" />
            <circle cx="12" cy="15.6" r=".8" fill="#ece7dc" />
          </g>
        </defs>
      </svg>

      <SiteHeader>
        <div className="nav-links">
          {/* plain links like the header's: a full load, so the landing's scripts start fresh */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#how">How it works</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#lists">Trust lists</a>
          <a href="https://github.com/easonchai/tocsin">GitHub</a>
        </div>
        <a className="btn signal" href="/demo">
          Open the demo <span className="arrow">↗</span>
        </a>
      </SiteHeader>

      <main className="claim">
        <div className="eyebrow">ENSv2 · Sepolia</div>
        <h1>
          Own <em style={{ fontStyle: "normal", color: "var(--signal)" }}>you.eth</em>? Claim you.tocsin.eth.
        </h1>
        <p className="lede">
          One rule: whoever owns <code>label.eth</code> on ENSv2 Sepolia can claim <code>label.tocsin.eth</code>. One
          transaction. Nobody approves it, and nobody can take it back, which you can verify below before you spend gas.
        </p>

        <section className="panel">
          <h2>
            <span className="n">01</span> Connect
          </h2>
          <div className="row">
            <button className="btn primary" id="connect">
              Connect wallet
            </button>
            <span className="status" id="acct" style={{ margin: 0 }}></span>
          </div>
          <p className="note">
            Sepolia only. The page switches your wallet if needed. You pay gas; the name costs 8 test USDC, which the
            page mints for you.
          </p>
        </section>

        <section className="panel">
          <h2>
            <span className="n">02</span> Check a label
          </h2>
          <div className="row">
            <input type="text" id="label" placeholder="yourname" autoComplete="off" spellCheck="false" />
            <span className="suffix">.eth → .tocsin.eth</span>
            <button className="btn" id="check">
              Check
            </button>
          </div>
          <div className="status" id="checkOut"></div>
        </section>

        <section className="panel">
          <h2>
            <span className="n">03</span> Register the .eth name if you do not own it
          </h2>
          <div className="row">
            <button className="btn" id="register" disabled>
              Register label.eth
            </button>
          </div>
          <div className="status" id="regOut"></div>
          <p className="note">
            Mint test USDC, approve, commit, wait 60 seconds, register. Five transactions. Skip this if you already own
            the name.
          </p>
        </section>

        <section className="panel">
          <h2>
            <span className="n">04</span> Claim
          </h2>
          <div className="row">
            <button className="btn primary" id="claim" disabled>
              Claim label.tocsin.eth
            </button>
          </div>
          <div className="status" id="claimOut"></div>
          <p className="note">
            Deploys your own Permissioned Resolver if you have none, calls <code>claim</code> on the MirrorRegistrar,
            sets the addr record. Up to three transactions.
          </p>
        </section>

        <section className="panel">
          <h2>
            <span className="n">05</span> Verify the guarantees, live
          </h2>
          <div className="row">
            <button className="btn" id="verify">
              Read the registry
            </button>
          </div>
          <div className="kv" id="verifyOut" style={{ marginTop: 12 }}></div>
          <p className="note">
            Read straight from the Sepolia contracts. &quot;Emancipated&quot; means no account holds a role that can
            change or remove any name in the registry.
          </p>
        </section>

        <section className="panel">
          <h2>
            <span className="n">06</span> Claimed so far
          </h2>
          <ul className="claims" id="claims" style={{ listStyle: "none", padding: 0, margin: 0 }}></ul>
        </section>

        <p className="note">
          Addresses and source:{" "}
          <a
            href="https://github.com/easonchai/tocsin/blob/main/docs/claim-a-name.md"
            style={{ color: "var(--paper-100)" }}
          >
            docs/claim-a-name.md
          </a>
          . The team claims its own names from the terminal with{" "}
          <code>node --env-file=scripts/.env scripts/ens/setup-all.mjs</code>, which needs the maintainer key, so this
          page is the route for everyone else.
        </p>
      </main>

      <ClaimScripts />
    </>
  );
};

export default Claim;
