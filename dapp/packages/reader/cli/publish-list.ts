// Publish CLI for trust lists and safelists.
//   publish-list fill <template.json> <out.json>   fill placeholders from TOCSIN_* env vars
//   publish-list sign <document.json> <listURI>    print the ENS record value to stdout
// The maintainer key comes from MAINTAINER_PRIVATE_KEY or the Foundry keystore named by
// MAINTAINER_ACCOUNT, read at run time from the environment or the ignored packages/reader/.env.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Hex, isAddress, isAddressEqual, isHex, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash, normalize } from "viem/ens";
import {
  LIST_RECORD_KEY,
  SAFELIST_RECORD_KEY,
  encodeListRecord,
  listRoot,
  listRootTypedData,
  parseList,
} from "../src/lists/index.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see packages/reader/.env.example)`);
  return v;
};
const address = (name: string): string => {
  const v = need(name);
  if (!isAddress(v, { strict: false })) throw new Error(`${name} is not an address: ${v}`);
  return v.toLowerCase();
};

function fill(templatePath: string, outPath: string): void {
  const base = new URL(need("TOCSIN_SITE_BASE_URL")).href.replace(/\/+$/, "");
  const operator = normalize(need("TOCSIN_OPERATOR_NAME"));
  const vars: Record<string, string> = {
    MAINTAINER: address("TOCSIN_MAINTAINER"),
    MANUAL_WRITER: address("TOCSIN_MANUAL_WRITER"),
    DETECTOR_WRITER: address("TOCSIN_DETECTOR_WRITER"),
    SITE_BASE_URL: base,
    OPERATOR_NAME: operator,
    OPERATOR_NAMEHASH: namehash(operator),
  };
  const sub = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const v = vars[k];
      if (v === undefined) throw new Error(`unknown placeholder {{${k}}}`);
      return v;
    });
  // Substitute inside parsed JSON values and keys so no env value can break the JSON.
  const walk = (v: unknown): unknown =>
    typeof v === "string"
      ? sub(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [sub(k), walk(x)]))
          : v;
  const filled = walk(JSON.parse(readFileSync(templatePath, "utf8"))) as Record<string, unknown>;
  listRoot(parseList("subjects" in filled ? "safelist" : "list", filled)); // throws on an invalid field
  writeFileSync(outPath, `${JSON.stringify(filled, null, 2)}\n`);
  console.error(`wrote ${outPath}`);
}

type TypedData = ReturnType<typeof listRootTypedData>;

function signWithKeystore(account: string, typed: TypedData): Hex {
  // cast reads eth_signTypedData_v4 JSON, which needs EIP712Domain and JSON-safe integers.
  const json = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...typed.types,
    },
    primaryType: typed.primaryType,
    domain: { ...typed.domain, chainId: typed.domain.chainId.toString() },
    message: { ...typed.message, version: typed.message.version.toString() },
  };
  const dir = mkdtempSync(join(tmpdir(), "publish-list-"));
  try {
    const file = join(dir, "typed.json");
    writeFileSync(file, JSON.stringify(json));
    const out = execFileSync("cast", ["wallet", "sign", "--data", "--from-file", file, "--account", account], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"], // cast prompts for the keystore password on the terminal
    }).trim();
    if (!isHex(out)) throw new Error(`cast returned no signature: ${out}`);
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function sign(documentPath: string, listURI: string): Promise<void> {
  const document = JSON.parse(readFileSync(documentPath, "utf8")) as Record<string, unknown>;
  const kind = "subjects" in document ? "safelist" : "list";
  const list = parseList(kind, document);
  const root = listRoot(list);
  const typed = listRootTypedData(list, root);

  const pk = process.env.MAINTAINER_PRIVATE_KEY;
  const account = process.env.MAINTAINER_ACCOUNT;
  let signature: Hex;
  if (pk) {
    if (!isHex(pk) || pk.length !== 66) throw new Error("MAINTAINER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
    signature = await privateKeyToAccount(pk).signTypedData(typed);
  } else if (account) signature = signWithKeystore(account, typed);
  else throw new Error("set MAINTAINER_PRIVATE_KEY or MAINTAINER_ACCOUNT (see packages/reader/.env.example)");

  const signer = await recoverTypedDataAddress({ ...typed, signature });
  if (!isAddressEqual(signer, list.maintainer))
    throw new Error(`signing key ${signer} is not the document's maintainer ${list.maintainer}`);

  console.error(`${kind} version ${list.version}, root ${root}, maintainer ${signer}`);
  console.error(`text record key: ${kind === "list" ? LIST_RECORD_KEY : SAFELIST_RECORD_KEY}`);
  console.log(encodeListRecord({ root, version: list.version, signature, listURI }));
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "fill" && a && b) fill(a, b);
else if (cmd === "sign" && a && b) await sign(a, b);
else {
  console.error("usage: publish-list fill <template.json> <out.json> | publish-list sign <document.json> <listURI>");
  process.exit(2);
}
