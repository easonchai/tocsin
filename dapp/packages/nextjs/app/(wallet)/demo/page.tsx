"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HeaderActions, errorCode, isKohaku } from "./_components/HeaderActions";
import { ScenarioCard } from "./_components/ScenarioCard";
import { Stage } from "./_components/Stage";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { SiteHeader } from "~~/components/SiteHeader";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";
import "~~/styles/demo.css";
import { explain } from "~~/utils/demo/explain";
import { GROUPS, type Group, POISON_RPC, SCENARIOS, buildTx } from "~~/utils/demo/scenarios";
import { timeline } from "~~/utils/demo/timeline";
import { getParsedError } from "~~/utils/scaffold-eth";

const plainError = (e: unknown) =>
  errorCode(e) === 4001 || errorCode((e as { cause?: unknown } | null)?.cause) === 4001
    ? "You rejected it in the wallet."
    : getParsedError(e);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type SendState = { id: string; busy?: true; hash?: Hex; error?: string };

const CopyRpc = () => {
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();
  return (
    <span className="copy">
      {POISON_RPC}
      <button type="button" className="btn sm" onClick={() => copyToClipboard(POISON_RPC)}>
        {isCopiedToClipboard ? "Copied" : "Copy"}
      </button>
      <small>paste into the Snap RPC setting first</small>
    </span>
  );
};

const Demo: NextPage = () => {
  const { address, chainId, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [tab, setTab] = useState<"All" | Group>("All");
  const [cur, setCur] = useState(-1);
  const [run, setRun] = useState(0);
  const [fired, setFired] = useState(0);
  const [presenter, setPresenter] = useState(false);
  const [sent, setSent] = useState<SendState>();
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<DOMRect | null>(null);

  const s = cur >= 0 ? SCENARIOS[cur] : undefined;
  const scene = s && explain(s);
  const cues = s && scene ? timeline(s, scene) : [];
  const final = fired >= cues.length;
  const on = (key: string) => {
    const i = cues.findIndex(c => c.key === key);
    return i >= 0 && i < fired;
  };

  const open = useCallback((i: number, from?: HTMLElement) => {
    flipFrom.current = from && !reducedMotion() ? from.getBoundingClientRect() : null;
    setCur(i);
    setRun(r => r + 1);
    setFired(0);
    window.scrollTo({ top: 0 });
  }, []);
  const back = () => setCur(-1);
  const replay = () => {
    setRun(r => r + 1);
    setFired(0);
  };
  const skip = useCallback(() => setFired(Infinity), []);

  // The timed sequence: each cue turns its piece of the stage on. Reduced motion lands on the final frame.
  useEffect(() => {
    if (cur < 0) return;
    const sc = SCENARIOS[cur];
    const list = timeline(sc, explain(sc));
    if (reducedMotion()) return setFired(Infinity);
    const timers = list.map((c, i) => setTimeout(() => setFired(n => Math.max(n, i + 1)), c.at));
    return () => timers.forEach(clearTimeout);
  }, [cur, run]);

  // FLIP: a copy of the lifted card flies from where it sat in the grid to the focus row.
  useLayoutEffect(() => {
    const first = flipFrom.current;
    const el = hero.current;
    flipFrom.current = null;
    if (!first || !el || !root.current) return;
    const last = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("flying");
    Object.assign(ghost.style, {
      left: `${last.left}px`,
      top: `${last.top}px`,
      width: `${last.width}px`,
      height: `${last.height}px`,
      transform: `translate(${first.left - last.left}px, ${first.top - last.top}px)`,
    });
    root.current.append(ghost);
    el.style.visibility = "hidden";
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => (ghost.style.transform = "none")));
    const done = setTimeout(() => {
      ghost.remove();
      el.style.visibility = "";
    }, 440);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      ghost.remove();
      el.style.visibility = "";
    };
  }, [cur]);

  const kohakuBlocked = Boolean(s?.snapOnly && isKohaku(connector?.name));
  const send = async () => {
    if (!s || kohakuBlocked) return;
    if (!address) return openConnectModal?.();
    if (chainId !== sepolia.id) return switchChain({ chainId: sepolia.id });
    if (!walletClient) return setSent({ id: s.id, error: "The wallet is still connecting. Try again in a second." });
    setSent({ id: s.id, busy: true });
    try {
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: sepolia,
        ...buildTx(s.tx, address),
      });
      setSent({ id: s.id, hash });
    } catch (e) {
      setSent({ id: s.id, error: plainError(e) });
    }
  };

  // Re-bound every render so the handler sees the current scenario and frame.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof Element && e.target.closest("input, textarea")))
        return;
      const k = e.key.toLowerCase();
      if (k === "p") return setPresenter(p => !p);
      if (cur < 0) return;
      if (k === "arrowdown" || k === "arrowright") open(Math.min(SCENARIOS.length - 1, cur + 1));
      else if (k === "arrowup" || k === "arrowleft") open(Math.max(0, cur - 1));
      else if (k === "r") replay();
      else if (k === "escape") back();
      else if (k === "enter") {
        if (final) send();
        else skip();
      } else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const mine = sent && s && sent.id === s.id ? sent : undefined;
  const sendLabel = !address
    ? "Connect wallet"
    : chainId !== sepolia.id
      ? "Switch to Sepolia"
      : mine?.busy
        ? "The wallet is answering…"
        : "Send it to the wallet";

  return (
    <div ref={root} className={`demo${presenter ? " presenter" : ""}`}>
      {!presenter && (
        <SiteHeader label="demo · sepolia">
          <HeaderActions />
        </SiteHeader>
      )}
      {!s || !scene ? (
        <>
          <nav className="tabs" aria-label="Filter by action">
            {(["All", ...GROUPS] as const).map(g => (
              <button
                key={g}
                type="button"
                className={g === tab ? "tab on" : "tab"}
                aria-pressed={g === tab}
                onClick={() => setTab(g)}
              >
                {g}
              </button>
            ))}
          </nav>
          <section className="cards" aria-label="Scenarios">
            {SCENARIOS.map((sc, i) =>
              tab === "All" || sc.group === tab ? (
                <ScenarioCard key={sc.id} s={sc} onOpen={from => open(i, from)} />
              ) : null,
            )}
          </section>
        </>
      ) : (
        <>
          <section className="focus" aria-label="Chosen scenario">
            <button type="button" className="btn back" onClick={back}>
              ← All scenarios
            </button>
            <div>
              <ScenarioCard s={s} ref={hero} />
              <div className="cta">
                <button
                  type="button"
                  className={`btn ${scene.verdict === "warn" || scene.verdict === "block" ? "signal" : "primary"}`}
                  onClick={send}
                  disabled={kohakuBlocked || mine?.busy}
                >
                  {sendLabel}
                </button>
                {mine?.error && (
                  <span role="alert" className="sent bad">
                    {mine.error}
                  </span>
                )}
                {mine?.hash && (
                  <span role="status" className="sent">
                    Sent:{" "}
                    <a href={`https://sepolia.etherscan.io/tx/${mine.hash}`} target="_blank" rel="noopener noreferrer">
                      {mine.hash.slice(0, 10)}…
                    </a>
                  </span>
                )}
                {s.poison && <CopyRpc />}
                {s.snapOnly && (
                  <span className="copy">
                    <small>
                      {kohakuBlocked
                        ? "Kohaku does not catch this one yet. Connect MetaMask with the Tocsin Snap to send it."
                        : "Snap only: Kohaku does not catch this one yet."}
                    </small>
                  </span>
                )}
                <div className="foot">
                  The wallet should say this. The stage is drawn from the seed table; the wallet checks the chain
                  itself.
                </div>
              </div>
            </div>
            <div className="nav">
              <button type="button" className="btn" onClick={() => open(cur - 1)} disabled={cur === 0}>
                ↑ Previous
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => open(cur + 1)}
                disabled={cur === SCENARIOS.length - 1}
              >
                Next ↓
              </button>
            </div>
          </section>
          <Stage key={`${s.id}:${run}`} s={s} scene={scene} on={on} connected={address} onSkip={skip} />
        </>
      )}
    </div>
  );
};

export default Demo;
