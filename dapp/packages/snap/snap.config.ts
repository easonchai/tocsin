import type { SnapConfig } from "@metamask/snaps-cli";

// Build-time defaults, read from the shell that runs `mm-snap build`. None is secret except an RPC
// URL that embeds an API key, which then ships in the bundle: use a keyless RPC for a public build.
const config: SnapConfig = {
  input: "src/index.tsx",
  server: { port: 8080 },
  // A dependency mentions Buffer in a guarded branch; the minified bundle has no bare Buffer and evaluates in SES.
  stats: { buffer: false },
  environment: {
    TOCSIN_RPC_URL: process.env.TOCSIN_RPC_URL ?? "",
    TOCSIN_LIST_NAME: process.env.TOCSIN_LIST_NAME ?? "",
    TOCSIN_LIST_RECORD: process.env.TOCSIN_LIST_RECORD ?? "",
    TOCSIN_PROXY_URL: process.env.TOCSIN_PROXY_URL ?? "",
    TOCSIN_LOG_FROM_BLOCK: process.env.TOCSIN_LOG_FROM_BLOCK ?? "",
  },
};

export default config;
