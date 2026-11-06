"use client";

import { useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { SNAP_ID } from "~~/utils/demo/scenarios";
import { getParsedError } from "~~/utils/scaffold-eth";

export const errorCode = (e: unknown) => (e as { code?: unknown } | null)?.code;

// Kohaku is an Ambire fork; its EIP-6963 name may still say Ambire.
export const isKohaku = (connectorName?: string) => /kohaku|ambire/i.test(connectorName ?? "");

/** Which host will answer the Send, as the presenter needs to read it. */
const hostOf = (connectorName?: string) =>
  isKohaku(connectorName) ? "Kohaku" : connectorName === "MetaMask" ? "MetaMask + Tocsin Snap" : connectorName;

const InstallSnap = ({ onMessage }: { onMessage: (m?: { text: string; bad?: boolean }) => void }) => {
  const { connector } = useAccount();
  const [busy, setBusy] = useState(false);

  const install = async () => {
    if (!connector) return onMessage({ text: "Connect MetaMask Flask first, then install the Snap.", bad: true });
    setBusy(true);
    onMessage(undefined);
    try {
      // SAFETY: every wagmi injected or EIP-6963 connector returns an EIP-1193 provider.
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      };
      // Already installed is not an error: MetaMask returns the installed Snap.
      await provider.request({ method: "wallet_requestSnaps", params: { [SNAP_ID]: {} } });
      onMessage({ text: `Snap installed from ${SNAP_ID}.` });
    } catch (e) {
      const text =
        errorCode(e) === -32601
          ? "This wallet does not run Snaps. Connect MetaMask Flask."
          : errorCode(e) === 4001
            ? "You rejected the install in the wallet."
            : `${getParsedError(e)} Is the Snap dev server running on localhost:8080?`;
      onMessage({ text, bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={install} disabled={busy}>
      {busy ? "Installing…" : "Install Snap"}
    </button>
  );
};

const Overflow = () => {
  const ref = useRef<HTMLDetailsElement>(null);
  useOutsideClick(ref, () => ref.current?.removeAttribute("open"));
  return (
    <details className="more" ref={ref}>
      <summary className="btn" aria-label="More">
        ⋯
      </summary>
      {/* plain links: the scaffold routes load their own CSS on a full page load */}
      <div className="menu">
        <a href="/debug">Debug contracts</a>
        <a href="/blockexplorer">Block explorer</a>
      </div>
    </details>
  );
};

/** The demo header's right slot: account and host, Install Snap, and the scaffold pages behind a menu. */
export const HeaderActions = () => {
  const { connector } = useAccount();
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();

  return (
    <div className="hdr">
      {/* RainbowKit's button with kit classes: the scaffold's custom button is built on DaisyUI, which /demo does not load */}
      <ConnectButton.Custom>
        {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) =>
          !mounted || !account || !chain ? (
            <button type="button" className="btn" onClick={openConnectModal}>
              Connect wallet
            </button>
          ) : chain.unsupported || chain.id !== sepolia.id ? (
            <button type="button" className="btn" onClick={openChainModal}>
              Wrong network
            </button>
          ) : (
            <button type="button" className="btn" onClick={openAccountModal}>
              {account.displayName}
              {connector?.name && ` · ${hostOf(connector.name)}`}
            </button>
          )
        }
      </ConnectButton.Custom>
      <InstallSnap onMessage={setMessage} />
      <Overflow />
      {message && (
        <p role={message.bad ? "alert" : "status"} className={`hdr-msg${message.bad ? " bad" : ""}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};
