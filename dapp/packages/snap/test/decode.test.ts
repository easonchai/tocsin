// node --test: which address the Snap evaluates, and in which context.
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, getAddress, maxUint256, parseAbi, zeroAddress } from "viem";
import { signatureTargets, transactionTargets } from "../src/decode.ts";
import { parseListName, parseRpcUrl } from "../src/settings.ts";

const TOKEN = getAddress("0x1111111111111111111111111111111111111111");
const BAD = getAddress("0xbad0000000000000000000000000000000000bad");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");

const abi = parseAbi([
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "struct PermitDetails { address token; uint160 amount; uint48 expiration; uint48 nonce; }",
  "struct PermitSingle { PermitDetails details; address spender; uint256 sigDeadline; }",
  "struct PermitBatch { PermitDetails[] details; address spender; uint256 sigDeadline; }",
  "function permit(address owner, PermitSingle permitSingle, bytes signature)",
  "function permit(address owner, PermitBatch permitBatch, bytes signature)",
  "function balanceOf(address who) view returns (uint256)",
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);
const ROUTER = getAddress("0x2222222222222222222222222222222222222222");
const details = { token: TOKEN, amount: 1n, expiration: 1, nonce: 0 };
const pick = (ts: ReturnType<typeof transactionTargets>) => ts.map((t) => [t.address, t.context]);

test("a plain send evaluates `to` as recipient", () => {
  assert.deepEqual(pick(transactionTargets({ to: BAD.toLowerCase(), data: "0x" })), [[BAD, "recipient"]]);
});

test("contract creation has no target", () => {
  assert.deepEqual(transactionTargets({ to: null, data: "0x6080" }), []);
});

test("ERC-20 transfer adds the decoded recipient", () => {
  const data = encodeFunctionData({ abi, functionName: "transfer", args: [BAD, 5n] });
  assert.deepEqual(pick(transactionTargets({ to: TOKEN, data })), [
    [TOKEN, "recipient"],
    [BAD, "recipient"],
    [TOKEN, "token"],
  ]);
});

test("ERC-20 approve adds the spender", () => {
  const data = encodeFunctionData({ abi, functionName: "approve", args: [BAD, maxUint256] });
  const ts = transactionTargets({ to: TOKEN, data });
  assert.deepEqual(pick(ts), [
    [TOKEN, "recipient"],
    [BAD, "spender"],
    [TOKEN, "token"],
  ]);
  assert.equal(ts[1]?.why, "ERC-20 approve spender");
});

test("setApprovalForAll adds the operator as spender", () => {
  const data = encodeFunctionData({ abi, functionName: "setApprovalForAll", args: [BAD, true] });
  assert.deepEqual(pick(transactionTargets({ to: TOKEN, data }))[1], [BAD, "spender"]);
});

test("EIP-2612 permit sent as a transaction adds the spender, not the owner", () => {
  const data = encodeFunctionData({
    abi,
    functionName: "permit",
    args: [TOKEN, BAD, 1n, 1n, 27, `0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`],
  });
  const ts = transactionTargets({ to: TOKEN, data });
  assert.deepEqual(pick(ts)[1], [BAD, "spender"]);
  assert.equal(ts[1]?.why, "EIP-2612 permit spender");
});

test("Permit2 approve adds the spender, not the token", () => {
  const data = encodeFunctionData({ abi, functionName: "approve", args: [TOKEN, BAD, 1n, 1] });
  const ts = transactionTargets({ to: PERMIT2, data });
  assert.deepEqual(pick(ts), [
    [PERMIT2, "recipient"],
    [BAD, "spender"],
  ]);
  assert.equal(ts[1]?.why, "Permit2 approve spender");
});

test("Permit2 permit, single and batch, adds the spender", () => {
  const single = encodeFunctionData({
    abi,
    functionName: "permit",
    args: [TOKEN, { details, spender: BAD, sigDeadline: 1n }, "0x"],
  });
  const batch = encodeFunctionData({
    abi,
    functionName: "permit",
    args: [TOKEN, { details: [details, details], spender: BAD, sigDeadline: 1n }, "0x"],
  });
  for (const data of [single, batch]) {
    const ts = transactionTargets({ to: PERMIT2, data });
    assert.deepEqual(pick(ts)[1], [BAD, "spender"]);
    assert.equal(ts[1]?.why, "Permit2 permit spender");
  }
});

test("SwapRouter02 exactInputSingle adds the swap recipient alongside the router", () => {
  const data = encodeFunctionData({
    abi,
    functionName: "exactInputSingle",
    args: [{ tokenIn: TOKEN, tokenOut: zeroAddress, fee: 3000, recipient: BAD, amountIn: 1n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
  });
  const ts = transactionTargets({ to: ROUTER, data });
  assert.deepEqual(pick(ts), [
    [ROUTER, "recipient"],
    [BAD, "recipient"],
  ]);
  assert.equal(ts[1]?.why, "swap recipient");
});

test("unknown or malformed calldata adds nothing beyond `to`", () => {
  const known = encodeFunctionData({ abi, functionName: "balanceOf", args: [BAD] });
  assert.deepEqual(pick(transactionTargets({ to: TOKEN, data: known })), [[TOKEN, "recipient"]]);
  assert.deepEqual(pick(transactionTargets({ to: TOKEN, data: "0xa9059cbb1234" })), [[TOKEN, "recipient"]]);
});

const permit = {
  types: {
    EIP712Domain: [{ name: "chainId", type: "uint256" }],
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
  },
  primaryType: "Permit",
  domain: { name: "Token", chainId: 11155111, verifyingContract: TOKEN },
  message: { owner: TOKEN, spender: BAD.toLowerCase(), value: "1", nonce: "0", deadline: "1" },
};

test("EIP-2612 typed data yields the spender and the domain chain, as an object or a JSON string", () => {
  for (const data of [permit, JSON.stringify(permit)]) {
    const { targets, chainId } = signatureTargets(data);
    assert.deepEqual(pick(targets), [[BAD, "spender"]]);
    assert.equal(chainId, 11155111n);
  }
});

test("Permit2 typed data yields the spender", () => {
  for (const primaryType of ["PermitSingle", "PermitBatch", "PermitTransferFrom", "PermitWitnessTransferFrom"]) {
    const data = { primaryType, domain: { name: "Permit2", chainId: "0xaa36a7" }, message: { details, spender: BAD } };
    const { targets, chainId } = signatureTargets(data);
    assert.deepEqual(pick(targets), [[BAD, "spender"]], primaryType);
    assert.equal(targets[0]?.why, "Permit2 permit spender");
    assert.equal(chainId, 11155111n);
  }
});

test("other typed data and garbage yield no target", () => {
  assert.deepEqual(signatureTargets({ ...permit, primaryType: "Mail" }).targets, []);
  assert.deepEqual(signatureTargets({ ...permit, message: { spender: "not an address" } }).targets, []);
  assert.deepEqual(signatureTargets({ ...permit, message: { spender: zeroAddress } }).targets.length, 1);
  assert.deepEqual(signatureTargets("{not json").targets, []);
  assert.deepEqual(signatureTargets(null).targets, []);
});

test("RPC URL: https anywhere, http only for localhost", () => {
  assert.deepEqual(parseRpcUrl(" https://rpc.example "), { url: "https://rpc.example/" });
  assert.deepEqual(parseRpcUrl("http://127.0.0.1:8550"), { url: "http://127.0.0.1:8550/" });
  for (const bad of ["http://rpc.example", "ftp://x", "", 7]) assert.ok("error" in parseRpcUrl(bad), String(bad));
});

test("list name: normalised ENS name with a dot", () => {
  assert.deepEqual(parseListName(" Seal.Tocsin.eth "), { name: "seal.tocsin.eth" });
  for (const bad of ["nodot", "", undefined, "a b.eth"]) assert.ok("error" in parseListName(bad), String(bad));
});
