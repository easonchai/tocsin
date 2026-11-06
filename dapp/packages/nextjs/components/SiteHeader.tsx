import type { ReactNode } from "react";
import "~~/styles/site-header.css";

type Props = {
  /** Mono label after the wordmark, e.g. "demo · sepolia". */
  label?: string;
  /** Rendered on the right: the landing's nav links, or the demo's connect button. */
  children?: ReactNode;
};

/** The one header on every Tocsin route: the bell, the wordmark, an optional label, then the page's own actions. */
export const SiteHeader = ({ label, children }: Props) => {
  return (
    <nav className="nav site-header">
      <div className="wrap">
        <div className="brand">
          {/* a plain link, so leaving a route reloads it and no route's CSS or wallet state carries over */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="home" href="/">
            <span className="bell" role="img" aria-label="bell">
              🔔
            </span>
            <span className="wordmark">tocsin</span>
          </a>
          {label && <span className="label">{label}</span>}
        </div>
        {children && <div className="end">{children}</div>}
      </div>
    </nav>
  );
};
