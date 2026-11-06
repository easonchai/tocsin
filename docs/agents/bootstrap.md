# Own writers and lists

`./bootstrap.sh` puts flags from writers you hold the keys to on the shared Sepolia log and signs your own three list documents, so the demo runs on your lists end to end. The log, the demo tokens and the demo account stay the committed ones. Nothing is deployed and ENS is not touched: the hosts take the signed records directly, so the three names are labels.

## Steps

1. From the repo root run `./bootstrap.sh`. It needs Node 20 or later and network access. No Foundry, no global yarn, no keys of yours.
2. It generates eight keys into `.tocsin-demo/keys.env` (gitignored, testnet only), then prints one address and waits for 0.12 Sepolia ETH to land there. Give the human that address and the faucet links exactly as printed and leave the script running: it checks every 15 seconds for 30 minutes, then exits. If it exits, run it again once the human says the ETH is sent.
3. Done when it prints "Done" with the four writer addresses. By then it has forwarded 0.05 ETH to the manual writer, sent six transactions (three seed batches, two curator batches, one token flag), written the list documents and the mirror to `site/local/` (gitignored) and written `.tocsin-demo/demo.env`.
4. Run `./demo.sh`. It sources `demo.env`, rebuilds the Snap and Kohaku with your records, and starts the servers. Done when it prints "All up".
5. Verify the three beats from the command line before handing off:

   ```sh
   source .tocsin-demo/demo.env && cd dapp
   yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source rpc      # verdict block
   yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source proxy    # verdict unavailable, chain mismatch at sequence 1
   yarn workspace @tocsin/infra eval 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537 --source mirror   # verdict block
   ```

   All three verdicts as commented means the lists, the flags and the lying proxy agree. Then hand off the browser step with the paths `demo.sh` printed and the beats in `RUNBOOK.md`; the only difference from the committed demo is that the writers shown are yours.

## Rerunning

The script skips every step whose output exists: the keys file, the start block, the three manifests in `.tocsin-demo/`. The list documents, the mirror and the signatures are redone every run, since they are cheap and deterministic. A step that failed mid-way (an RPC timeout, say) is retried by running the script again. To start over with new keys, delete `.tocsin-demo/` and `site/local/`; the old writers' flags stay on the log, which is append-only, and no longer matter once no list names them.

## What it does not cover

- The detector as a running process. The seed writes the detector's batch, so the beats work without it. To run it: `yarn workspace @tocsin/infra detect` with `.tocsin-demo/keys.env` sourced; the operator runbook in `docs/plan/demo/runbook.md` has the tuning.
- Deploying the log, ENS names and reverse records, own demo tokens. The operator runbook covers each.
