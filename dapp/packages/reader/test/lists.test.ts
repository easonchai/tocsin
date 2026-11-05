import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Address, type Hex, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { describe, expect, it } from "vitest";
import {
  type SignedList,
  acceptList,
  encodeListRecord,
  listRoot,
  listRootTypedData,
  parseList,
  resolveWriters,
} from "../src/lists/index.ts";

const LOG: Address = "0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865";
const CHAIN_ID = 11155111;
const ctx = { kind: "list", log: LOG, chainId: CHAIN_ID } as const;

const maintainer = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const writerA = privateKeyToAccount(generatePrivateKey()).address;
const writerB = privateKeyToAccount(generatePrivateKey()).address;

const entry = (writer: Address, weight: number) => ({
  writer,
  weight,
  operator: namehash("tocsin.eth"),
  upstream: zeroHash,
  fromBlock: 0,
  toBlock: 0,
  headPin: zeroHash,
  categories: "0x1",
  snapshotURI: `https://example.test/mirror/${writer.toLowerCase()}.json`,
});

const doc = (version: number, by: Address = maintainer.address, entries = [entry(writerA, 255), entry(writerB, 1)]) => ({
  log: LOG,
  chainId: CHAIN_ID,
  maintainer: by,
  version,
  entries,
  labels: {
    "tocsin.eth": namehash("tocsin.eth"),
    "wrong.eth": namehash("tocsin.eth"), // hash does not match the name
    "unrelated.eth": namehash("unrelated.eth"), // hashes, but to no entry's operator or upstream
  },
});

async function sign(document: unknown, signer = maintainer): Promise<SignedList> {
  const list = parseList("list", document);
  const root = listRoot(list);
  const signature = await signer.signTypedData(listRootTypedData(list, root));
  return { record: encodeListRecord({ root, version: list.version, signature, listURI: "https://example.test/lists/default.json" }), document };
}

describe("acceptList", () => {
  it("accepts and pins a signed list on first sight, keeping only labels that hash to an entry", async () => {
    const out = await acceptList({ ...ctx, fetched: await sign(doc(1)) });
    expect(out.status).toBe("accepted");
    expect(out.list?.maintainer).toBe(maintainer.address);
    expect(out.list?.version).toBe(1n);
    expect(out.list?.labels).toEqual({ "tocsin.eth": namehash("tocsin.eth") });
  });

  it("hashes the typed struct, so reformatted JSON with the same values still verifies", async () => {
    const signed = await sign(doc(1));
    const d = doc(1);
    const reformatted = { ...d, chainId: String(CHAIN_ID), version: "0x1", entries: d.entries.map(e => ({ ...e, weight: String(e.weight) })) };
    const out = await acceptList({ ...ctx, fetched: { record: signed.record, document: reformatted } });
    expect(out.status).toBe("accepted");
  });

  it("rejects a document whose hash does not match the root, and keeps the pinned list", async () => {
    const pinned = await sign(doc(1));
    const good = await sign(doc(2));
    const d = doc(2);
    const tampered = { ...d, entries: [entry(writerA, 255), entry(writerB, 255)] };
    const out = await acceptList({ ...ctx, pinned, fetched: { record: good.record, document: tampered } });
    expect(out).toMatchObject({ status: "rejected", reason: "hash-mismatch" });
    expect(out.list?.version).toBe(1n);
  });

  it("rejects a bad signature", async () => {
    const forged = await sign(doc(1), other); // doc names `maintainer`, signed by `other`
    expect(await acceptList({ ...ctx, fetched: forged })).toMatchObject({ status: "rejected", reason: "bad-signature" });
    const list = parseList("list", doc(1));
    const root = listRoot(list);
    const sig = await maintainer.signTypedData(listRootTypedData(list, root));
    const corrupt = `${sig.slice(0, 10)}${sig[10] === "a" ? "b" : "a"}${sig.slice(11)}` as Hex; // one nibble of r
    const record = encodeListRecord({ root, version: 1n, signature: corrupt, listURI: "x" });
    expect(await acceptList({ ...ctx, fetched: { record, document: doc(1) } })).toMatchObject({ status: "rejected", reason: "bad-signature" });
  });

  it("rejects a lower version and keeps the pinned one", async () => {
    const out = await acceptList({ ...ctx, pinned: await sign(doc(2)), fetched: await sign(doc(1)) });
    expect(out).toMatchObject({ status: "rejected", reason: "lower-version" });
    expect(out.list?.version).toBe(2n);
  });

  it("accepts a higher version from the pinned maintainer", async () => {
    const out = await acceptList({ ...ctx, pinned: await sign(doc(1)), fetched: await sign(doc(2)) });
    expect(out.status).toBe("accepted");
    expect(out.list?.version).toBe(2n);
  });

  it("returns a conflict for a different maintainer and keeps applying the pinned list", async () => {
    const out = await acceptList({ ...ctx, pinned: await sign(doc(1)), fetched: await sign(doc(5, other.address), other) });
    expect(out.status).toBe("conflict");
    if (out.status !== "conflict") return;
    expect(out.list.maintainer).toBe(maintainer.address);
    expect(out.candidate.maintainer).toBe(other.address);
  });

  it("keeps the last verified version marked stale when the record is unverifiable", async () => {
    const out = await acceptList({ ...ctx, pinned: await sign(doc(3)) });
    expect(out.status).toBe("stale");
    expect(out.list?.version).toBe(3n);
  });

  it("rejects a list for a different log", async () => {
    const out = await acceptList({ ...ctx, log: writerA, fetched: await sign(doc(1)) });
    expect(out).toMatchObject({ status: "rejected", reason: "wrong-log" });
  });
});

describe("resolveWriters", () => {
  it("gives unavailable for zero resolvable writers", async () => {
    const nothing = await acceptList({ ...ctx }); // no record, no pin
    expect(nothing.status).toBe("unavailable");
    const empty = await acceptList({ ...ctx, fetched: await sign(doc(1, maintainer.address, [])) });
    const rejected = await acceptList({ ...ctx, fetched: await sign(doc(1), other) });
    expect(resolveWriters([nothing, empty, rejected])).toEqual({ status: "unavailable" });
  });

  it("returns the union of writers across applied lists", async () => {
    const out = await acceptList({ ...ctx, fetched: await sign(doc(1)) });
    expect(resolveWriters([out, out])).toEqual({ status: "ok", writers: [writerA, writerB] });
  });
});

describe("publish-list CLI", () => {
  it("fills the default template and emits a record the reader accepts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-list-"));
    const out = join(dir, "default.json");
    const tsx = join(import.meta.dirname, "../node_modules/.bin/tsx");
    const cli = join(import.meta.dirname, "../cli/publish-list.ts");
    const template = join(import.meta.dirname, "../../../../site/lists/default.template.json");
    const env = {
      PATH: process.env.PATH,
      MAINTAINER_PRIVATE_KEY: generatePrivateKey(),
      TOCSIN_MANUAL_WRITER: writerA,
      TOCSIN_DETECTOR_WRITER: writerB,
      TOCSIN_SITE_BASE_URL: "https://example.test/",
      TOCSIN_OPERATOR_NAME: "Tocsin.eth",
    };
    const cliMaintainer = privateKeyToAccount(env.MAINTAINER_PRIVATE_KEY).address;
    execFileSync(tsx, [cli, "fill", template, out], { env: { ...env, TOCSIN_MAINTAINER: cliMaintainer } });
    const record = execFileSync(tsx, [cli, "sign", out, "https://example.test/lists/default.json"], { env, encoding: "utf8" }).trim() as Hex;

    const document = JSON.parse(readFileSync(out, "utf8"));
    expect(document.entries[0]).toMatchObject({ weight: 255, snapshotURI: `https://example.test/mirror/${writerA.toLowerCase()}.json` });
    expect(document.entries[1].snapshotURI).toBe(`https://example.test/mirror/${writerB.toLowerCase()}.json`);
    expect(record).toMatch(/^0x[0-9a-f]+$/);

    const accepted = await acceptList({ ...ctx, fetched: { record, document } });
    expect(accepted.status).toBe("accepted");
    expect(accepted.list?.listURI).toBe("https://example.test/lists/default.json");
    expect(accepted.list?.labels).toEqual({ "tocsin.eth": namehash("tocsin.eth") });
  }, 30_000);
});
