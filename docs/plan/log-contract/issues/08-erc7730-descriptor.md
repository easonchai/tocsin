# 08: ERC-7730 clear-signing descriptor

Spec: `docs/plan/log-contract/spec.md`, Implementation decisions, Deployment, ERC-7730 bullet. PRD: `erc/eip-draft_threat_flag_log.md`, Interface, ERC-7730 bullet (added in v2.1).

**What to build:** A writer signing a batch from a hardware device or a Safe sees each subject, the category name, and the op name on the device, not a hash. The descriptor file that makes this possible is in the repo, validates, and names the Sepolia deployment.

**Blocked by:** 01 (Scaffold, reference contract, normative cases 1 to 9)

**Ethskills:** standards, wallets (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [x] One ERC-7730 JSON file with a calldata format for `append` and `appendSigned` and an EIP-712 format for the `Append` typed data in the `ThreatFlagLog` version `1` domain, every leaf field displayed. (Two files, because the schema allows one context per file. See Comments.)
- [x] `category` and `op` display by name through enums that equal the ERC's tables: categories 1 to 8 as named there, ops FLAG, TOMBSTONE, COUNTER, DISPUTE.
- [x] The deployments list names Sepolia and the CREATE2 address the deploy script predicts.
- [x] The file passes the ERC-7730 schema check, and the command used is recorded in the ticket's Comments.

## Comments

**2026-11-06.** Descriptors are in `dapp/packages/foundry/erc7730/`: `calldata-ThreatFlagLog.json` (`append`, `appendSigned`) and `eip712-ThreatFlagLog.json` (`Append`). They sit next to the deploy script because each deployment publishes its own descriptor and the address comes from that script. File names follow the LedgerHQ registry convention, so they can be submitted there unchanged.

Spec conflict: the ticket and the build spec say one file. ERC-7730 schema v2 (2.1.0) makes `context` a `oneOf` of `contract` and `eip712`, so a calldata context and an EIP-712 context cannot share a file. The registry does the same thing for Permit2 (`calldata-*` and `eip712-*`). The spec's Deployment bullet and the ERC's ERC-7730 bullet both still read correctly if "descriptor" means this pair.

What the files contain:

- `$schema` is `https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json`, the alias of the active line.
- Deployment `{ chainId: 11155111, address: 0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865 }`. I recomputed the address with `cast compute-address` from the current `out/` init code, deployer `0x4e59b448...4956C`, salt zero. The EIP-712 context also binds domain `name: ThreatFlagLog`, `version: 1`.
- The EIP-712 format key is exactly the contract's `APPEND_TYPEHASH` string.
- All seven leaf fields are shown in a bundled group, so the device steps through leaf by leaf ("Leaf {index}") and does not list all subjects before all categories. `subject` and `writer` use `addressName`. `category` and `op` use `enum`. `chainId`, `evidence`, `seenBlock`, `refLeaf` and `nonce` use `raw`. `deadline` uses `date` (timestamp). `chainId` stays `raw` because `0` means every EVM chain and a `chainId` formatter has no name for it.
- `appendSigned.signature` is `visible: never`. It is the writer's signature, not something the relayer approves.

Validation, with the official linter (`erc7730` 1.0.13 from LedgerHQ/python-erc7730, the latest release):

```
~/.local/bin/uvx --python 3.12 --from erc7730 erc7730 lint dapp/packages/foundry/erc7730/
```

Result: `eip712-ThreatFlagLog.json` reports no issue. `calldata-ThreatFlagLog.json` reports one warning, "Could not fetch ABI ... chain id 11155111 ... not available on Sourcify". The address has no code until the deploy. The v2 linter only takes its reference ABI from Sourcify or Etherscan. It ignores the deprecated `contract.abi` key and the `--skip-abi-validation` flag, so embedding the ABI does not help.

To run the ABI checks before deploy, I ran the same v2 linter with its ABI client pointed at `out/ThreatFlagLog.sol/ThreatFlagLog.json`. The same script validates both files against `erc7730-v2.schema.json` 2.1.0 with `jsonschema` and asserts the enums equal the ERC tables. Schema and enum checks pass for both files. The linter then reports one warning per function: "No display field is defined for path `#.leaves.[]`". That warning comes from the linter itself. For a `tuple[]` parameter it treats the array root as a field of its own, even when every component is displayed. The only way to silence it is a field on `leaves` itself. A visible one would show the raw array. A `visible: never` one risks a wallet hiding every leaf under it, and it would also switch off the linter's per-field check, because the linter counts a field on a parent path as covering everything below. Both are worse for the signer, so the warning stays. Rerun the plain `erc7730 lint` command above after the Sepolia deploy and Sourcify verification. The fetch warning should then go away, leaving only the `#.leaves.[]` warning.
- 2026-11-06: The pre-deploy check script is committed at `dapp/packages/foundry/erc7730/check.py`. From the foundry package: `curl -sO https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json && uvx --python 3.12 --from erc7730 --with jsonschema python erc7730/check.py erc7730-v2.schema.json out/ThreatFlagLog.sol/ThreatFlagLog.json erc7730/*.json`.
