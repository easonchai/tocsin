## Set up and run

Two paths. Take the first unless the user asks for lists or writers of their own.

- **The demo as committed.** `./demo.sh`, then the beats in `RUNBOOK.md`. Nothing to fund, deploy or configure: the log is live on Sepolia and the three lists are published on their ENS names.
- **Own writers and lists on the shared log.** `./bootstrap.sh`, then `./demo.sh`. Read `docs/agents/bootstrap.md` first: the script stops once for one Sepolia ETH transfer only the human can make, and the doc says how to hand that off and how to verify the result before the browser step.

Loading Kohaku or the Snap in Chrome is the human's step on both paths. Hand it off with the paths `demo.sh` prints and the beats in `RUNBOOK.md`.

## Ethskills

Before you start a task, load every ethskill whose row matches it. A task that touches several rows, such as contract code plus its tests, loads all of them. You're done with this step when every matching ethskill is in context.

In Claude Code, load `ethskills:<name>` (`why` is `ethskills:why-ethereum`). Other agents fetch `https://ethskills.com/<name>/SKILL.md`.

| Task | Ethskill |
| --- | --- |
| Deciding product scope, chain, or whether to adopt or write an EIP | `why` |
| Building the smart contracts | `ship` |
| Writing contract specs, including `docs/spec/` | `crops`, `protocol` |
| Checking whether an EIP or fork feature is live | `protocol` |
| Estimating or validating gas and dollar costs | `gas` |
| Building the wallet: keys, signing, delegation | `wallets` |
| Citing any EIP or ERC | `standards` |
| Picking a package, library, or version | `tools` |
| Deploying to Sepolia or mainnet, or rehearsing a deploy on a fork | `orchestration` |
| Designing or explaining how something onchain works | `concepts` |
| Security review of contract code | `security` |
| Writing tests | `testing` |
| Reading past onchain activity or adding an indexer | `indexing` |
| Building the frontend demo | `frontend-ux`, `frontend-playbook` |
| QA on the frontend before the demo | `qa` |
| Auditing the contracts | `audit` |

The settled decisions in `HANDOFF.md` take precedence over ethskill advice. If they conflict, follow `HANDOFF.md` and point out the conflict.

## Agent skills

### Issue tracker

Issues live as tracked markdown files under `docs/plan/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
