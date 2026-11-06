import type { Metadata } from "next";
import "~~/styles/kit.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

// No providers and no header here: each page renders SiteHeader, and wallet code loads only in app/(wallet).
export const metadata: Metadata = {
  ...getMetadata({
    title: "Tocsin",
    description: "Scam addresses, verified on chain.",
    imageRelativePath: "/og.png",
  }),
  icons: { icon: "/favicon.svg" },
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;
