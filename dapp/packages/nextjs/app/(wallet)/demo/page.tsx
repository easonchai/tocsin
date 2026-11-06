"use client";

import { useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { sepolia } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { SiteHeader } from "~~/components/SiteHeader";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useCopyToClipboard, useTransactor } from "~~/hooks/scaffold-eth";
import {
  GROUPS,
  HONEST_RPC,
  POISON_RPC,
  SCENARIOS,
  SNAP_ID,
  type Scenario,
  type Verdict,
  buildTx,
} from "~~/utils/demo/scenarios";
import { getParsedError } from "~~/utils/scaffold-eth";

const VERDICT: Record<Verdict, { text: string; badge: string }> = {
  clean: { text: "wallet should pass", badge: "badge-success" },
  warn: { text: "wallet should warn", badge: "badge-warning" },
  block: { text: "wallet should block", badge: "badge-error" },
};

const ACTION: Record<Scenario["tx"]["kind"], string> = {
  eth: "Send",
  transfer: "Send",
  approve: "Approve",
  swap: "Swap",
};

const errorCode = (e: unknown) => (e as { code?: unknown } | null)?.code;

const plainError = (e: unknown) =>
  errorCode(e) === 4001 || errorCode((e as { cause?: unknown } | null)?.cause) === 4001
    ? "You rejected it in the wallet."
    : getParsedError(e);

const InstallSnap = () => {
  const { connector } = useAccount();
  const [state, setState] = useState<{ busy: boolean; done?: boolean; error?: string }>({ busy: false });

  const install = async () => {
    if (!connector) return setState({ busy: false, error: "Connect MetaMask Flask first, then install the Snap." });
    setState({ busy: true });
    try {
      // SAFETY: every wagmi injected or EIP-6963 connector returns an EIP-1193 provider.
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      };
      // Already installed is not an error: MetaMask returns the installed Snap.
      await provider.request({ method: "wallet_requestSnaps", params: { [SNAP_ID]: {} } });
      setState({ busy: false, done: true });
    } catch (e) {
      const error =
        errorCode(e) === -32601
          ? "This wallet does not run Snaps. Connect MetaMask Flask."
          : errorCode(e) === 4001
            ? "You rejected the install in the wallet."
            : `${getParsedError(e)} Is the Snap dev server running on localhost:8080?`;
      setState({ busy: false, error });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="btn btn-secondary btn-sm" onClick={install} disabled={state.busy}>
        {state.busy && <span className="loading loading-spinner loading-sm" />}
        Install Snap
      </button>
      {state.done && <p className="m-0 text-sm text-success">Snap installed from {SNAP_ID}.</p>}
      {state.error && (
        <p role="alert" className="m-0 text-sm text-error">
          {state.error}
        </p>
      )}
    </div>
  );
};

const RpcBox = ({ label, url }: { label: string; url: string }) => {
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();
  const id = `rpc-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1 grow">
      <label htmlFor={id} className="text-sm font-semibold">
        {label} RPC
      </label>
      <div className="join w-full">
        <input id={id} readOnly value={url} className="input input-sm join-item grow font-mono" />
        <button type="button" className="btn btn-sm join-item" onClick={() => copyToClipboard(url)}>
          {isCopiedToClipboard ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
};

const ScenarioRow = ({ scenario }: { scenario: Scenario }) => {
  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const transactor = useTransactor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = async () => {
    if (!walletClient || !address) return;
    setBusy(true);
    setError(undefined);
    try {
      await transactor(() =>
        walletClient.sendTransaction({
          account: walletClient.account,
          chain: sepolia,
          ...buildTx(scenario.tx, address),
        }),
      );
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(false);
    }
  };

  const button = !address
    ? { label: "Connect wallet", onClick: openConnectModal }
    : chainId !== sepolia.id
      ? { label: "Switch to Sepolia", onClick: () => switchChain({ chainId: sepolia.id }) }
      : { label: ACTION[scenario.tx.kind], onClick: send };
  const verdict = VERDICT[scenario.expected];

  return (
    <li className="flex flex-col md:flex-row md:items-start gap-4 py-4 border-b border-base-300 last:border-b-0">
      <div className="flex flex-col gap-2 grow min-w-0">
        <h3 className="m-0 text-lg font-semibold">{scenario.title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono">{scenario.subjectLabel}</span>
          {scenario.subject !== "connected" && <Address address={scenario.subject} format="short" size="sm" />}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`badge ${verdict.badge}`}>{verdict.text}</span>
          {scenario.lists.length === 0 ? (
            <span className="badge badge-ghost">no list flags it</span>
          ) : (
            scenario.lists.map(list => (
              <span key={list} className="badge badge-outline">
                {list}
              </span>
            ))
          )}
          {scenario.category && (
            <span className="badge badge-neutral">{scenario.category.toLowerCase().replaceAll("_", " ")}</span>
          )}
          {scenario.snapOnly && (
            <span className="badge badge-secondary h-auto">Snap only until Kohaku lands lists and token checks</span>
          )}
        </div>
        {scenario.note && <p className="m-0 text-sm opacity-80">{scenario.note}</p>}
      </div>
      <div className="flex flex-col gap-1 md:items-end md:w-56 shrink-0">
        <button type="button" className="btn btn-primary btn-sm" onClick={button.onClick} disabled={busy}>
          {busy && <span className="loading loading-spinner loading-sm" />}
          {button.label}
        </button>
        {error && (
          <p role="alert" className="m-0 text-sm text-error md:text-right">
            {error}
          </p>
        )}
      </div>
    </li>
  );
};

const Home: NextPage = () => {
  const { address } = useAccount();

  return (
    <>
      <SiteHeader label="demo · sepolia" />
      <div className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
        <section aria-labelledby="board-heading" className="flex flex-col gap-4">
          <h1 id="board-heading" className="m-0 text-3xl font-bold">
            Tocsin demo board
          </h1>
          <p className="m-0 max-w-2xl">
            Each button builds one transaction with a fixed tiny amount and hands it to your wallet. This page checks
            nothing. The verdict you see comes from the wallet.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            {!address && <RainbowKitCustomConnectButton />}
            <InstallSnap />
          </div>
        </section>

        <section aria-label="RPC endpoints" className="flex flex-col gap-2 bg-base-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <RpcBox label="Poison" url={POISON_RPC} />
            <RpcBox label="Honest" url={HONEST_RPC} />
          </div>
          <p className="m-0 text-sm">
            Paste into the Snap or Kohaku RPC setting, not MetaMask&apos;s network settings.
          </p>
        </section>

        {GROUPS.map(group => (
          <section key={group} aria-labelledby={`group-${group.replace(" ", "-")}`} className="flex flex-col">
            <h2
              id={`group-${group.replace(" ", "-")}`}
              className="m-0 text-xl font-bold border-b-2 border-base-300 pb-2"
            >
              {group}
            </h2>
            <ul className="m-0 p-0 list-none">
              {SCENARIOS.filter(s => s.group === group).map(s => (
                <ScenarioRow key={s.id} scenario={s} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
};

export default Home;
