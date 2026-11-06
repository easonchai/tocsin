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
- One bite, everyone immune. The first wallet bitten immunizes every wallet that syncs.
- Nothing is ever removed. Corrections are new leaves. A reader that wants a flag gone drops the writer, not the record.
