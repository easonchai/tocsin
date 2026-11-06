// Bundles the extension into dist/ with the esbuild already installed under the Next.js package,
// so it needs no new dependency and no workspace link. Helios, the Anon-RPC harness and viem
// resolve from the Next.js package's node_modules, where ticket 01's harness gets them too.
//
// Settings are read at build time from the shell, then from packages/nextjs/.env.local (the
// harness page's file, so the same RPCs serve both). An RPC URL with an API key ends up in
// dist/, which is git-ignored; use keyless RPCs for a build you hand to anyone.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nextjs = join(here, "../nextjs");
const nextModules = join(nextjs, "node_modules");
const { build } = createRequire(join(nextjs, "package.json"))("esbuild");

const envFile = join(nextjs, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile); // never overrides a variable already set in the shell

const env = (k) => (process.env[k] ?? "").trim();
const fail = (msg) => {
  console.error(`extension build: ${msg}`);
  process.exit(1);
};
const config = {
  sepoliaConsensus: env("NEXT_PUBLIC_HARNESS_SEPOLIA_CONSENSUS_RPC"),
  sepoliaExecution: env("NEXT_PUBLIC_HARNESS_SEPOLIA_EXECUTION_RPC"),
  mainnetConsensus: env("NEXT_PUBLIC_HARNESS_MAINNET_CONSENSUS_RPC"),
  mainnetExecution: env("NEXT_PUBLIC_HARNESS_MAINNET_EXECUTION_RPC"),
  torGateways: env("NEXT_PUBLIC_HARNESS_TOR_GATEWAYS").split(",").map((s) => s.trim()).filter(Boolean),
  transport: env("TOCSIN_TRANSPORT") || "tor",
  listName: env("TOCSIN_LIST_NAME"),
  listRecord: env("TOCSIN_LIST_RECORD"),
  fromBlock: env("TOCSIN_LOG_FROM_BLOCK") || "0",
};
if (!["tor", "nym", "direct"].includes(config.transport)) fail(`TOCSIN_TRANSPORT must be tor, nym or direct, got ${config.transport}`);
if (config.listRecord && !/^0x[0-9a-fA-F]*$/.test(config.listRecord)) fail("TOCSIN_LIST_RECORD must be 0x-prefixed hex");
if (!/^\d+$/.test(config.fromBlock)) fail("TOCSIN_LOG_FROM_BLOCK must be a block number");
for (const [k, v] of Object.entries(config)) if (v === "" && k !== "listRecord") console.warn(`extension build: ${k} is empty; the overlay will say so`);
if (config.fromBlock === "0") console.warn("extension build: TOCSIN_LOG_FROM_BLOCK is unset, so the first leaf scan starts at Sepolia block 0");

// Every import of the harness package goes to the wrapper that hands it iframeUrl, except the wrapper's own.
const shim = join(here, "src/anon-harness.ts");
const anonIframeUrl = {
  name: "anon-iframe-url",
  setup(b) {
    b.onResolve({ filter: /^@anon-rpc\/browser-harness$/ }, (args) => (args.importer === shim ? undefined : { path: shim }));
  },
};

const out = join(here, "dist");
mkdirSync(out, { recursive: true });
const common = { bundle: true, target: "chrome116", nodePaths: [nextModules], logLevel: "warning", legalComments: "none" };

await Promise.all([
  build({ ...common, entryPoints: [join(here, "src/page-entry.ts")], outfile: join(out, "page.js"), format: "iife" }),
  build({ ...common, entryPoints: [join(here, "src/bridge.ts")], outfile: join(out, "bridge.js"), format: "iife" }),
  build({ ...common, entryPoints: [join(here, "src/background.ts")], outfile: join(out, "background.js"), format: "iife" }),
  build({
    ...common,
    entryPoints: [join(here, "src/offscreen.ts")],
    outfile: join(out, "offscreen.js"),
    format: "esm",
    define: { __TOCSIN_CONFIG__: JSON.stringify(config) },
    plugins: [anonIframeUrl],
  }),
]);

for (const f of readdirSync(join(here, "static"))) copyFileSync(join(here, "static", f), join(out, f));
copyFileSync(join(nextModules, "@anon-rpc/browser-harness/dist/iframe-boot.js"), join(out, "iframe-boot.js"));
console.log(`extension build: dist/ ready (transport ${config.transport})`);
