// Usage: yarn relay <signed-batch.json>
// Exit 0 when sent, 2 when dropped, 1 on error.
import { readFile } from "node:fs/promises";
import { parseBatch } from "./batch.js";
import { accountFrom, connect, senderFor } from "./env.js";
import { relay } from "./relayer.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: yarn relay <signed-batch.json>");
  process.exit(1);
}

try {
  const batch = parseBatch(JSON.parse(await readFile(file, "utf8")));
  const target = await connect();
  const result = await relay(batch, target, senderFor(target, accountFrom("RELAYER_PRIVATE_KEY")));
  console.log(JSON.stringify(result, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));
  process.exit(result.status === "sent" ? 0 : 2);
} catch (err) {
  console.error("relay failed:", err);
  process.exit(1);
}
