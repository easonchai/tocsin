# Pitch arguments

Lines to lift into the pitch. Each one is a complete argument on its own.

## The targeted supply-chain attack

A targeted supply-chain attack on a wallet needs two things: a point in the chain that can lie, and a way to know the lie is landing on the right victim.

Today's security lookups give an attacker both. The vendor API or the RPC is a single party that can answer "clean." And the request itself tells it who is asking and which address they are about to pay. So a compromised endpoint can lie to one victim and stay honest to everyone else, which is why nobody notices.

Tocsin removes both.

The answer is provable. The endpoint cannot say "clean" when the chain says "flagged," because the wallet proves the log's head against a finalized Ethereum state root. It cannot drop a flag either, because the replay stops landing on the head.

And the wallet never asks about an address at all. It syncs the whole log for the writers it trusts and checks locally. The only requests on the wire are "header, proof, leaves," identical for every user. There is no per-victim query to target.

The attacker cannot lie to you, and cannot tell it is you.

With anon-rpc underneath, they cannot see your IP either, which closes the last way to single you out.

The honest residue: an endpoint can still withhold. Then the wallet says "unverifiable," never "clean." A silent attack becomes a loud one.

## The follow-up they will ask

"Sync everything doesn't scale." Readers sync only the writers on their trust lists, and every writer has its own head, so a million-leaf spam namespace costs a reader that does not follow it nothing. Have the real numbers ready: leaf count and sync size for a realistic list.

## The one-liners

- Every wallet asks a company whether an address is safe. We built the first one that asks Ethereum instead, and catches the company lying.
- The contract is deliberately dumb. The reader is where the work is.
- Flag it once, every wallet that syncs sees it. The first wallet to meet the attacker warns all the others.
- Nothing is ever removed. Corrections are new leaves. A reader that wants a flag gone drops the writer, not the record.

## "Can't someone fake a list and a head? Hashing is cheap."

Anyone can make a fake head in milliseconds. It is worthless, because the wallet never accepts a head from anyone. It reads the head out of Ethereum's state.

The contract computes the head when a leaf is appended and stores it in a storage slot. That slot is committed by the state root in every block header. The wallet's light client verifies the header from sync-committee signatures, then verifies a Merkle proof from the state root down to the slot. The head it compares against was produced on-chain and signed by Ethereum's validators. The extension and the `/harness` page do this through Helios today. In Kohaku and the Snap the header still comes from one RPC, so a forged head is caught only once a light client is wired in. A forged or missing flag fails the replay in every host.

Walk the attacker through it:

- They hash 1,000 fake leaves into a chain and hold a fake head F. Trivial.
- Their RPC serves those leaves. The wallet replays them and lands on F.
- The wallet compares F to the proven head. They differ. Verdict: unverifiable.
- For F to be accepted, the proven head would have to equal F. That needs a forged storage proof against a real state root (a keccak preimage) or a forged header with 512 validator signatures (a BLS forgery). Both are the security of Ethereum itself.

The one real trick: serve the real leaves and the real head, minus one flag. That replays to a different head, so it fails too. A hash chain is order-and-content sensitive. Remove, insert, reorder or edit any leaf and every head after it changes.

What cheap hashing does buy an attacker: spam under their own writer address, which no reader pinned so no reader downloads; or bribing a listed writer to flag something false, which the reader fixes by dropping that writer from its list. Nothing on the chain changes either way.

The sentence: "Anyone can make a fake head. The wallet does not take heads from people. It takes them from Ethereum's state, under a proof it checks itself."

## "Can this flag scam links and domains, not just addresses?"

Not in the current draft, on purpose. The subject is a 20-byte address plus a chain id, and the categories are limited to on-chain infrastructure attackers reuse across victims: poisoning operators and funders, drainer receivers and spenders, malicious 7702 delegates, malicious tokens, paid lookalikes, theft proceeds. Each category names the on-chain evidence that proves the role, which is what makes a flag verifiable rather than an opinion.

A domain has no on-chain evidence. "This URL is a phishing site" cannot be checked against a transaction, so it would be a trust-me record in a log whose point is that nothing is trust-me. It also has a bigger, faster-churning namespace that would bloat every reader's sync.

If it is ever wanted, the shape is a new category where the subject is the first 20 bytes of keccak(normalized domain) and the evidence is a hash of an archived page. The log does not change. It is one line in the category table and a reader-side rule. Say that when asked, then say it is not in scope for the first version because every flag in v1 must be checkable on-chain.

## "Why not just use ENS?"

We do use ENS, for the part it is good at: names. Trust lists are published by maintainers under ENS names (seal.tocsin.eth, scamsniffer.tocsin.eth), and a reader resolves the list root and signature through the same verified state root it uses for the log.

ENS cannot be the log, for three reasons:

- ENS records are mutable. The owner can overwrite a text record, change the resolver, or transfer the name. A threat log must be append-only so that a bribed or compromised key cannot erase a flag. Here, nothing has a delete path.
- ENS has no history commitment. A record is a current value. There is no head that commits to every value that came before it, so a reader cannot prove "nothing was removed" or replay a list from its leaves.
- ENS is one key per name. A flag log needs many independent writers, each with their own chain, so a reader can pick which to believe and prove them all with one storage proof.

The sentence: "ENS tells you who the maintainer is. The log proves what they said and that none of it was taken back."

## "So it's a list on chain"

No. There is no list in the contract. Nothing is stored per flag. The contract keeps one running hash per writer, the head, and a count. Append means fold: `head = keccak(head, hash(flag))`, emit the flag as an event, forget it. Thirty-two bytes in, thirty-two bytes out.

A fold has one direction, and the contract has no operation that produces a head any other way. Edit, remove, insert, reorder: none of them can be expressed. Append-only is not a permission we enforce. It is the only move that exists.

The wallet proves the head from a block header, fetches the events from anyone, folds them itself, and compares 32 bytes. Match means complete and untouched. Mismatch means lied to.

The line: "The log does not remember your flags. It remembers a fingerprint of everything ever said, and the only way to touch that fingerprint is to say one more thing."
