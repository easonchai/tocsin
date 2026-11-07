"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { sepolia } from "viem/chains";
import { useAccount, useConnect, useConnectors } from "wagmi";
import { SNAP_ID, SNAP_IS_LOCAL } from "~~/utils/demo/scenarios";
import { getParsedError } from "~~/utils/scaffold-eth";

export const errorCode = (e: unknown) => (e as { code?: unknown } | null)?.code;

// Kohaku is an Ambire fork; its EIP-6963 name may still say Ambire.
export const isKohaku = (connectorName?: string) => /kohaku|ambire/i.test(connectorName ?? "");

/** Which host will answer the Send, as the presenter needs to read it. */
const hostOf = (connectorName?: string) =>
  isKohaku(connectorName) ? "Kohaku" : connectorName === "MetaMask" ? "MetaMask + Tocsin Snap" : connectorName;

// Flask announces itself over EIP-6963 under this rdns; wagmi uses it as the connector id.
const FLASK_RDNS = "io.metamask.flask";
const FLASK_STORE =
  "https://chromewebstore.google.com/detail/metamask-flask-developmen/ljfoeinjpaedjfecbmggjgodbgkmjkjk";
const isFlask = (c?: { id: string; name: string }) => !!c && /flask/i.test(`${c.id} ${c.name}`);

type Message = { text: string; bad?: boolean };

const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) => (
  <li className={done ? "done" : undefined}>
    <span className="n" aria-hidden>
      {done ? "✓" : n}
    </span>
    <div>
      <h3>{title}</h3>
      {children}
    </div>
  </li>
);

const InstallSnap = ({ onMessage }: { onMessage: (m?: Message) => void }) => {
  const { connector } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending: connecting } = useConnect();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const flask = connectors.find(c => c.id === FLASK_RDNS);
  const onFlask = isFlask(connector);

  const install = async () => {
    if (!connector) return;
    setBusy(true);
    setError(undefined);
    try {
      // SAFETY: every wagmi injected or EIP-6963 connector returns an EIP-1193 provider.
      const provider = (await connector.getProvider()) as {
        request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      };
      // Already installed is not an error: MetaMask returns the installed Snap.
      await provider.request({ method: "wallet_requestSnaps", params: { [SNAP_ID]: {} } });
      dialog.current?.close();
      onMessage({ text: `Snap installed from ${SNAP_ID}.` });
    } catch (e) {
      setError(
        errorCode(e) === -32601
          ? "This wallet does not run Snaps. Connect MetaMask Flask."
          : errorCode(e) === 4001
            ? "The wallet reported the install as rejected. If Flask showed a terms-of-use screen, open Flask from the toolbar, accept it there, then click Install Snap again."
            : SNAP_IS_LOCAL
              ? `${getParsedError(e)} Is the Snap server running at ${SNAP_ID.slice("local:".length)}?`
              : getParsedError(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    onMessage(undefined);
    setError(undefined);
    dialog.current?.showModal();
  };

  return (
    <>
      <button type="button" className="btn" onClick={open}>
        Install Snap
      </button>
      {/* native modal: focus trap, Escape and the backdrop come with showModal() */}
      <dialog
        ref={dialog}
        className="snap-modal"
        aria-labelledby="snap-modal-title"
        onClick={e => e.target === e.currentTarget && dialog.current?.close()}
      >
        <header>
          <h2 id="snap-modal-title">Install the Tocsin Snap</h2>
          <button type="button" className="btn sm" aria-label="Close" onClick={() => dialog.current?.close()}>
            ✕
          </button>
        </header>
        <p className="lede">
          The Snap needs network access, so regular MetaMask installs it only once MetaMask has reviewed and allowlisted
          it. Until then it runs in MetaMask Flask, the developer build.
        </p>
        <ol>
          <Step n={1} done={!!flask} title="Install MetaMask Flask">
            {flask ? (
              <p>Flask is in this browser.</p>
            ) : (
              <>
                <p>Add it from the Chrome Web Store, then reload this page so it can find Flask.</p>
                <div className="row">
                  <a className="btn" href={FLASK_STORE} target="_blank" rel="noopener noreferrer">
                    Open the store ↗
                  </a>
                  <button type="button" className="btn" onClick={() => location.reload()}>
                    Reload
                  </button>
                </div>
              </>
            )}
          </Step>
          <Step n={2} done={onFlask} title="Connect with Flask">
            {onFlask ? (
              <p>Connected through Flask.</p>
            ) : (
              <>
                <p>
                  {connector
                    ? `You are connected through ${connector.name}. Switch to Flask.`
                    : "Connect the Flask account you send from."}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={!flask || connecting}
                  onClick={() => flask && connect({ connector: flask, chainId: sepolia.id })}
                >
                  {connecting ? "Connecting…" : "Connect Flask"}
                </button>
              </>
            )}
          </Step>
          <Step n={3} done={false} title="Install the Snap">
            <p>
              Flask installs <code>{SNAP_ID}</code> {SNAP_IS_LOCAL ? "from your machine" : "from npm"} and asks you to
              approve it.
            </p>
            <button type="button" className="btn signal" disabled={!onFlask || busy} onClick={install}>
              {busy ? "Installing…" : "Install Snap"}
            </button>
            {error && (
              <p role="alert" className="err">
                {error}
              </p>
            )}
          </Step>
        </ol>
      </dialog>
    </>
  );
};

/** The demo header's right slot: account and host, and Install Snap. */
export const HeaderActions = () => {
  const { connector } = useAccount();
  const [message, setMessage] = useState<Message>();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(undefined), 3000);
    return () => clearTimeout(t);
  }, [message]);

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
      {message && (
        <p role={message.bad ? "alert" : "status"} className={`hdr-msg${message.bad ? " bad" : ""}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};
