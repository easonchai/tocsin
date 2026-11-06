// node --test: which addresses each held method is checked for. The decoding itself is the Snap's,
// tested in packages/snap/test/decode.test.ts; this covers the per-method unpacking around it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, getAddress, parseAbi } from "../../snap/node_modules/viem/_esm/index.js";
import { requestTargets } from "../src/targets.ts";

const BAD = getAddress("0xbad0000000000000000000000000000000000bad");
const TOKEN = getAddress("0x1111111111111111111111111111111111111111");
const abi = parseAbi(["function transfer(address to, uint256 amount)", "function approve(address spender, uint256 amount)"]);
const pick = (r: ReturnType<typeof requestTargets>) => r.targets.map((t) => [t.address, t.context]);

test("eth_sendTransaction checks `to` and the decoded recipient, on the wallet's chain", () => {
  const data = encodeFunctionData({ abi, functionName: "transfer", args: [BAD, 1n] });
  const r = requestTargets("eth_sendTransaction", [{ to: TOKEN, data }], "0xaa36a7");
  assert.deepEqual(pick(r), [[TOKEN, "recipient"], [BAD, "recipient"], [TOKEN, "token"]]);
  assert.equal(r.chainId, 11155111n);
});

test("eth_signTypedData_v4 checks the permit spender, on the domain's chain", () => {
  const typed = JSON.stringify({ primaryType: "Permit", domain: { chainId: 1 }, message: { owner: TOKEN, spender: BAD, value: "1" } });
  const r = requestTargets("eth_signTypedData_v4", [TOKEN, typed], "0xaa36a7");
  assert.deepEqual(pick(r), [[BAD, "spender"]]);
  assert.equal(r.chainId, 1n);
});

test("wallet_sendCalls checks every call once, on the batch's chain", () => {
  const approve = encodeFunctionData({ abi, functionName: "approve", args: [BAD, 1n] });
  const r = requestTargets("wallet_sendCalls", [{ chainId: "0x1", calls: [{ to: TOKEN, data: approve }, { to: BAD }, { to: TOKEN, data: approve }] }], "0xaa36a7");
  assert.deepEqual(pick(r), [[TOKEN, "recipient"], [BAD, "spender"], [TOKEN, "token"], [BAD, "recipient"]]);
  assert.equal(r.chainId, 1n);
});

test("malformed params from the page yield no targets instead of throwing", () => {
  for (const params of [undefined, null, "x", [null], [{ to: 5, data: {} }], [{ calls: "no" }]]) {
    for (const m of ["eth_sendTransaction", "eth_signTypedData_v4", "wallet_sendCalls"]) {
      assert.deepEqual(requestTargets(m, params, undefined).targets, [], `${m} ${JSON.stringify(params)}`);
    }
  }
});
