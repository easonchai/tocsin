import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Abi } from "viem";
import { formatAbiItem } from "viem/utils";
import { threatFlagLogAbi } from "./abi.js";

// Needs `forge build` in dapp/packages/foundry.
const compiled = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../foundry/out/ThreatFlagLog.sol/ThreatFlagLog.json", import.meta.url)), "utf8"),
).abi as Abi; // SAFETY: forge writes a standard ABI array under `abi`

describe("threatFlagLogAbi", () => {
  it("matches every item's signature in the compiled ThreatFlagLog ABI", () => {
    const sigs = new Set(compiled.filter((i) => i.type === "function" || i.type === "event").map((i) => formatAbiItem(i)));
    for (const item of threatFlagLogAbi) expect(sigs).toContain(formatAbiItem(item));
  });
});
