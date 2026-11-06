# Glossary

Terms as the spec's Definitions section states them (`docs/spec/threat-flag-log.md`). Use these words in code, tests, tickets and the pitch.

**Log.** The ThreatFlagLog contract. It stores heads and sequence numbers, emits every leaf, and has no owner.

**Writer.** The account whose namespace a leaf is appended to. It is `msg.sender` for `append`, or the account whose EIP-712 or ERC-1271 signature a batch carries for `appendSigned`. The relayer that submits a signed batch is not the writer.

**Leaf.** One record appended to the log: chain id, subject, category, op, evidence, seen block, reference leaf. A "flag" is a leaf with op `FLAG`.

**Subject.** The address a leaf is about. It is never indexed in the event.

**Head.** The current value of a hash chain. There is one head per writer (`writerHead`, storage slot 2) and one global head (`globalHead`, slot 0). Every head starts at zero.

**Maintainer.** The account whose EIP-712 signature authenticates a trust list. An ENS record locates a list; only the maintainer's signature authenticates it.

**Reader.** Any software that evaluates leaves against one or more trust lists: a wallet, a transaction guard, an explorer, an agent. A reader proves heads, syncs leaves from any source, and replays them.

**Trust list.** A maintainer-signed, versioned set of list entries that assigns weight to writers. The log knows nothing about lists.
