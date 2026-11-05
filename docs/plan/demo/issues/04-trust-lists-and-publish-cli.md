# 04: Trust list documents, signing, and the publish CLI

Spec: `docs/plan/demo/spec.md`, Implementation decisions, Trust lists; Testing decisions, lists. PRD: `erc/eip-draft_threat_flag_log.md`, Trust lists.

**What to build:** A maintainer runs one CLI command over a list document and gets back the signed ENS record value; a reader given that document, root, signature, and version accepts it, pins the maintainer, and rejects anything tampered, older, or signed by someone else.

**Blocked by:** None (can start immediately)

**Ethskills:** tools, wallets, standards (per AGENTS.md; load before starting)

**Status:** ready-for-human. Code and template are done. What remains is `site/lists/default.json`, which needs the real maintainer, manual writer and detector addresses: fill `dapp/packages/reader/.env` from `.env.example`, then run `yarn workspace @tocsin/reader publish-list fill ../../../site/lists/default.template.json ../../../site/lists/default.json` from `dapp/`. Workspace scripts run in the package directory, so the paths are relative to `dapp/packages/reader`.

- [x] JSON document with the `TrustList`, `Safelist`, and `ListEntry` fields as named in the ERC, including `snapshotURI`; the root is the keccak of the ABI-encoded typed struct, never of the JSON bytes.
- [x] EIP-712 `ListRoot(bytes32 root,uint64 version)` signature in the log's domain; the CLI reads the maintainer key from an ignored env file or keystore and emits the hex of `abi.encode(root, version, signature, listURI)`.
- [x] Unsigned `labels` map verified by ENSIP-15 normalise and namehash; a label that does not hash to an entry's `operator` or `upstream` is dropped.
- [x] Reader tests: hash mismatch rejected; bad signature rejected; lower version rejected; different maintainer returns a conflict and keeps the pinned list; unverifiable record keeps the last verified version marked stale; zero resolvable writers gives `unavailable`.
- [ ] The default list document for the demo exists: manual writer at weight 255, detector at warn weight, each entry's `snapshotURI` set to its mirror URL. The template exists at `site/lists/default.template.json` and a test fills it, signs it and gets it accepted. The filled `default.json` waits on the keys.

## Comments

### 2026-11-06

Built the list module, the publish CLI and the default list template.

- `dapp/packages/reader/src/lists/index.ts`: `parseList`, `listRoot`, `listRootTypedData`, `encodeListRecord`, `decodeListRecord`, `acceptList`, `resolveWriters`, the record key constants and the types. The EIP-712 domain is `ThreatFlagLog`, version `1`, the document's `chainId` and `log`, copied from `ThreatFlagLog.sol` `_buildDomain`. `src/index.ts` is not touched, so the coordinator wires the export.
- `dapp/packages/reader/cli/publish-list.ts`, run as `yarn workspace @tocsin/reader publish-list`. `fill <template> <out>` replaces `{{MAINTAINER}}`, `{{MANUAL_WRITER}}`, `{{DETECTOR_WRITER}}`, `{{SITE_BASE_URL}}`, `{{OPERATOR_NAME}}` and `{{OPERATOR_NAMEHASH}}` from `TOCSIN_*` env vars. `sign <document> <listURI>` prints the record value on stdout and the root, version and record key on stderr. The key comes from `MAINTAINER_PRIVATE_KEY`, or from the Foundry keystore named by `MAINTAINER_ACCOUNT` through `cast wallet sign --data`. With the keystore option the key never enters the Node process. The CLI refuses to emit a record if the signer is not the document's `maintainer`.
- `dapp/packages/reader/.env.example` lists names only. `dapp/packages/reader/.gitignore` ignores `.env`. Before this, `.env` was ignored only by the user's global git config.
- `site/lists/default.template.json`: the manual writer at weight 255 with category bit 0 (all of 1 to 127), the detector at weight 1 with category 1 only, both with operator set to the team name's namehash, snapshot URIs at `<base>/mirror/<writer-lowercase>.json`.
- `dapp/packages/reader/test/lists.test.ts`: 12 tests, all through the exported functions. One runs the real CLI with a throwaway generated key: fill the template, sign, then `acceptList` on the output.

Surprises and decisions:

- An equal version with a different root is rejected as `lower-version`. The ERC only says lower; accepting a second list at the same version would let a maintainer swap content without a bump.
- Two extra reject reasons beyond the ticket: `wrong-log` (the document names another log or chain than the reader's) and `version-mismatch` (the record's version differs from the one the root commits to).
- The pin a host stores is the raw `{ record, document }` pair, re-verified on every call. It is JSON-safe for Snap state, where bigints do not serialize.
- Both default writers share one operator, so the policy counts them as one writer. That matches the spec: no second independent maintainer on stage.
- I checked the keystore path's typed-data JSON against cast: the cast signature over it equals viem's.
- Maintainers with contract accounts (ERC-1271) are not supported. Verification is ECDSA recovery only, because the module is pure and makes no chain calls.
