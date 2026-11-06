import Link from "next/link";
import { SiteHeader } from "~~/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px 24px" }}>
        <div className="label">404</div>
        <h1 style={{ fontSize: 52, margin: "16px 0 32px" }}>Page not found.</h1>
        <Link className="btn primary" href="/">
          Go home
        </Link>
      </main>
    </>
  );
}
