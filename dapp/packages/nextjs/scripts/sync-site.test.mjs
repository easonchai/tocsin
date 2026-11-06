import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const app = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, app), "utf8");

test("generated landing keeps canonical content and only rebases deployment paths", async () => {
  const source = await read("../../../site/index.html");
  const generated = JSON.parse(await read("app/_generated/landing.json"));
  const visible = html =>
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  assert.equal(visible(generated.body), visible(source.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]));
  assert.equal(generated.metadata.title.absolute, source.match(/<title>(.*?)<\/title>/)[1]);
  assert(!generated.body.includes("<script"));
  assert(generated.body.includes('href="/demo"'));
  assert(generated.body.includes('href="/claim"'));
  for (const [, asset] of generated.body.matchAll(/(?:src|href)="(\/(?:kit|screens)\/[^\"]+)"/g)) {
    await access(new URL(`public${asset}`, app));
  }
});
