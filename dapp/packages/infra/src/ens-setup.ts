// Usage:
//   yarn ens-setup                                   owner key, once per name: ENSv2 subregistry, writer subnames,
//                                                    permissioned resolver, publish role for the maintainer
//   yarn ens-publish <list|safelist> <record.hex|->   maintainer key: set the record printed by `publish-list sign`
// ENSv2 is live on Sepolia (ticket 08 Comments), so there is no plain-public-resolver branch.
// Contract addresses come from ensjs 5.2.12's table for the connected chain, never from this file.
import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { addEnsContracts } from "@ensdomains/ensjs";
import { RESOLVER_ALL_ROLES, registryRoles } from "@ensdomains/ensjs/utils/v2";
import {
  createSubname,
  deploySubregistry,
  deployVerifiableProxy,
  grantResolverRoles,
  setRecords,
  setResolver,
  setSubregistry,
} from "@ensdomains/ensjs/wallet/v2";
import { LIST_RECORD_KEY, SAFELIST_RECORD_KEY, decodeListRecord } from "@tocsin/reader";
import {
  type Account,
  type Address,
  type Hash,
  type Hex,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getChainContractAddress,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  keccak256,
  labelhash,
  parseAbi,
  parseAbiParameters,
  parseEventLogs,
  stringToHex,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { namehash, normalize } from "viem/ens";
import { type KeyVar, accountFrom, connectChain, required } from "./env.js";

const registryAbi = parseAbi([
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
]);
const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);
const factoryAbi = parseAbi([
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const reverseRegistrarAbi = parseAbi(["function setName(string name) returns (bytes32)"]);

type Ens = Awaited<ReturnType<typeof connect>>;

async function connect() {
  const t = await connectChain();
  if (t.chainId !== sepolia.id) throw new Error(`ENS scripts run on Sepolia only; RPC_URL answers chain ${t.chainId}`);
  const chain = addEnsContracts({ ...sepolia, rpcUrls: t.chain.rpcUrls });
  const at = (contract: keyof typeof chain.contracts) => getChainContractAddress({ chain, contract });
  return {
    ...t,
    chain,
    ens: {
      registry: at("ensRegistry"), // the .eth registry
      factory: at("ensVerifiableFactory"),
      resolverImpl: at("ensPermissionedResolverImpl"),
      userRegistryImpl: at("ensUserRegistryImpl"),
      reverseRegistrar: at("ensReverseRegistrar"),
    },
  };
}

const walletFor = (c: Ens, account: Account) =>
  createWalletClient({ account, chain: c.chain, transport: http(c.chain.rpcUrls.default.http[0], { timeout: 30_000 }) });

/** `<label>.eth`, normalised. Subregistries of deeper names are out of scope for the demo. */
function teamName(): { name: string; label: string } {
  const name = normalize(required("ENS_NAME"));
  const m = /^([^.]+)\.eth$/.exec(name);
  if (!m?.[1]) throw new Error(`ENS_NAME must be a second-level .eth name, got ${name}`);
  return { name, label: m[1] };
}

/** `ENS_WRITERS=manual=0x...,detector=0x...` into label/address pairs. */
function writers(): { label: string; address: Address }[] {
  return required("ENS_WRITERS")
    .split(",")
    .map(pair => {
      const [rawLabel, addr] = pair.split("=").map(s => s.trim());
      const label = normalize(rawLabel ?? "");
      if (!label || label.includes(".")) throw new Error(`ENS_WRITERS label "${rawLabel}" must be one normalised label`);
      if (!addr || !isAddress(addr, { strict: false })) throw new Error(`ENS_WRITERS address for ${label} is not an address`);
      return { label, address: getAddress(addr) };
    });
}

async function confirm(c: Ens, what: string, hash: Hash): Promise<Hash> {
  const receipt = await c.public.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${what} ${hash} reverted on chain`);
  console.log(`${what}: ${hash}`);
  return hash;
}

async function deployedProxy(c: Ens, what: string, hash: Hash): Promise<Address> {
  await confirm(c, what, hash);
  const receipt = await c.public.getTransactionReceipt({ hash });
  const log = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs: receipt.logs })[0];
  if (!log) throw new Error(`${what} ${hash} emitted no ProxyDeployed event`);
  return log.args.proxyAddress;
}

// Salt conventions from docs.ens.domains/ensv2/verifiable-factory, version 0.
const resolverSalt = (owner: Address) =>
  BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [keccak256(stringToHex("OwnedResolver")), owner, 0n])));
const registrySalt = (node: Hex) =>
  BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32, uint256"), [keccak256(stringToHex("UserRegistry")), node, 0n])));

async function setup(): Promise<void> {
  const c = await connect();
  const { name, label } = teamName();
  const team = writers();
  const maintainerRaw = required("ENS_MAINTAINER");
  if (!isAddress(maintainerRaw, { strict: false })) throw new Error("ENS_MAINTAINER is not an address");
  const maintainer = getAddress(maintainerRaw);
  const owner = accountFrom("ENS_OWNER_PRIVATE_KEY");
  const wallet = walletFor(c, owner);
  const registry = { address: c.ens.registry, abi: registryAbi } as const;

  const tokenId = await c.public.readContract({ ...registry, functionName: "getTokenId", args: [BigInt(labelhash(label))] });
  const holder = await c.public.readContract({ ...registry, functionName: "ownerOf", args: [tokenId] });
  if (!isAddressEqual(holder, owner.address)) throw new Error(`${name} is held by ${holder}, not the ENS_OWNER_PRIVATE_KEY account ${owner.address}`);
  const expiry = await c.public.readContract({ ...registry, functionName: "getExpiry", args: [tokenId] });
  console.log(`${name} token ${tokenId}, owner ${owner.address}, expires ${new Date(Number(expiry) * 1000).toISOString()}`);

  // 1. The permissioned resolver, reused when the name already points at one the owner administers.
  let resolver = await c.public.readContract({ address: c.ens.registry, abi: registryAbi, functionName: "getResolver", args: [label] });
  const ours =
    resolver !== zeroAddress &&
    (await c.public
      .readContract({ address: resolver, abi: resolverAbi, functionName: "hasRootRoles", args: [RESOLVER_ALL_ROLES, owner.address] })
      .catch(() => false));
  if (!ours) {
    const callData = encodeFunctionData({
      abi: resolverAbi,
      functionName: "initialize",
      args: [[{ account: owner.address, roleBitmap: RESOLVER_ALL_ROLES }], []],
    });
    resolver = await deployedProxy(
      c,
      "deploy PermissionedResolver",
      await deployVerifiableProxy(wallet, {
        factoryAddress: c.ens.factory,
        implAddress: c.ens.resolverImpl,
        callData,
        salt: resolverSalt(owner.address),
      }),
    );
    await confirm(c, `setResolver ${name}`, await setResolver(wallet, { label, registryAddress: c.ens.registry, resolverAddress: resolver }));
  }
  console.log(`resolver ${resolver}`);

  // 2. The subregistry that holds the writer subnames.
  let subregistry = await c.public.readContract({ address: c.ens.registry, abi: registryAbi, functionName: "getSubregistry", args: [label] });
  if (subregistry === zeroAddress) {
    subregistry = await deployedProxy(
      c,
      "deploy UserRegistry",
      await deploySubregistry(wallet, {
        factoryAddress: c.ens.factory,
        implAddress: c.ens.userRegistryImpl,
        adminAddress: owner.address,
        salt: registrySalt(namehash(name)),
      }),
    );
    await confirm(c, `setSubregistry ${name}`, await setSubregistry(wallet, { registryAddress: c.ens.registry, label, subregistryAddress: subregistry }));
  }
  console.log(`subregistry ${subregistry}`);

  // 3. One subname per writer, on the same resolver, owned by the team key (the detector never holds ETH).
  for (const w of team) {
    const existing = await c.public.readContract({ address: subregistry, abi: registryAbi, functionName: "getResolver", args: [w.label] });
    if (existing === zeroAddress)
      await confirm(
        c,
        `register ${w.label}.${name}`,
        await createSubname(wallet, {
          registryAddress: subregistry,
          label: w.label,
          owner: owner.address,
          subregistryAddress: zeroAddress,
          resolverAddress: resolver,
          roleBitmap: registryRoles.ROLE_SET_RESOLVER | registryRoles.ROLE_SET_RESOLVER_ADMIN,
          expires: expiry,
        }),
      );
  }

  // 4. Forward addr records, which the reader checks against each writer's reverse name.
  for (const w of team)
    await confirm(
      c,
      `addr ${w.label}.${name} = ${w.address}`,
      await setRecords(wallet, { name: `${w.label}.${name}`, resolverAddress: resolver, coins: [{ coin: "ETH", value: w.address }] }),
    );

  // 5. Enhanced Access Control: the maintainer may set the two list keys on this resolver and nothing else.
  for (const key of [LIST_RECORD_KEY, SAFELIST_RECORD_KEY])
    await confirm(
      c,
      `grant setText(${key}) to ${maintainer}`,
      await grantResolverRoles(wallet, { resolverAddress: resolver, targetAccount: maintainer, scope: "setter", setter: { kind: "text", key } }),
    );

  // 6. Reverse records, sent by each writer key present in the env and holding ETH. Others show a short address.
  const writerKeys: KeyVar[] = ["MANUAL_WRITER_PRIVATE_KEY", "DETECTOR_PRIVATE_KEY"];
  for (const v of writerKeys) {
    if (!process.env[v]?.trim()) continue;
    const account = accountFrom(v);
    const w = team.find(t => t.address === account.address);
    if (!w) continue;
    if ((await c.public.getBalance({ address: account.address })) === 0n) {
      console.log(`skip reverse for ${w.label}: ${account.address} holds no ETH`);
      continue;
    }
    const writer = walletFor(c, account);
    const hash = await writer.writeContract({
      address: c.ens.reverseRegistrar,
      abi: reverseRegistrarAbi,
      functionName: "setName",
      args: [`${w.label}.${name}`],
    });
    await confirm(c, `reverse ${account.address} -> ${w.label}.${name}`, hash);
  }
}

async function publish(kind: string | undefined, source: string | undefined): Promise<void> {
  if ((kind !== "list" && kind !== "safelist") || !source) throw new Error("usage: yarn ens-publish <list|safelist> <record.hex|->");
  const raw = (source === "-" ? await text(process.stdin) : isHex(source) ? source : await readFile(source, "utf8")).trim();
  if (!isHex(raw)) throw new Error("the record value must be the 0x hex printed by `publish-list sign`");
  const record = decodeListRecord(raw); // throws on anything that is not abi.encode(root, version, signature, listURI)
  const key = kind === "list" ? LIST_RECORD_KEY : SAFELIST_RECORD_KEY;

  const c = await connect();
  const { name, label } = teamName();
  const resolver = await c.public.readContract({ address: c.ens.registry, abi: registryAbi, functionName: "getResolver", args: [label] });
  if (resolver === zeroAddress) throw new Error(`${name} has no resolver; run yarn ens-setup first`);
  const maintainer = accountFrom("MAINTAINER_PRIVATE_KEY");
  console.log(`${key} on ${name} via ${resolver}: version ${record.version}, root ${record.root}, ${record.listURI}`);
  await confirm(c, `setText ${key}`, await setRecords(walletFor(c, maintainer), { name, resolverAddress: resolver, texts: [{ key, value: raw }] }));
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "setup") await setup();
  else if (cmd === "publish") await publish(a, b);
  else throw new Error("usage: tsx src/ens-setup.ts setup | publish <list|safelist> <record.hex|->");
} catch (err) {
  console.error(`ens ${cmd ?? ""} failed:`, err);
  process.exit(1);
}
