#!/usr/bin/env bash
# One command for Sepolia: go/no-go gate, CREATE2 deploy with Etherscan verification,
# Sourcify verification, smoke append, then reads of the result from the chain.
#
# Reads from packages/foundry/.env or the shell:
#   SEPOLIA_RPC_URL            RPC for Sepolia (may carry a key, so it is passed as ETH_RPC_URL, never in argv)
#   ETHERSCAN_API_KEY          explorer key for verification
#   DEPLOYER_KEYSTORE_ACCOUNT  Foundry keystore name in ~/.foundry/keystores (`yarn generate` or `cast wallet import`)
# Optional: ETH_PASSWORD=<path to a password file> answers the keystore password prompts.
set -euo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PKG"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

PROXY=0x4e59b44847b379578588920cA78FbF26c0B4956C
SALT=0x0000000000000000000000000000000000000000000000000000000000000000
SEPOLIA_CHAIN_ID=11155111
# One leaf from a fresh writer used 466,147 gas on a Sepolia fork (Amsterdam rules, block 12071578),
# against 119,815 in snapshots/ThreatFlagLog.json under the test EVM. This leaves headroom over the fork figure.
SMOKE_GAS=600000

fail() { echo "NO-GO: $*" >&2; exit 1; }

echo "== Go/no-go gate"
for v in SEPOLIA_RPC_URL ETHERSCAN_API_KEY DEPLOYER_KEYSTORE_ACCOUNT; do
  [ -n "${!v:-}" ] || fail "$v is not set (see .env.example)"
done
[ "$DEPLOYER_KEYSTORE_ACCOUNT" != scaffold-eth-default ] || fail "scaffold-eth-default is a public localhost key"
[ -f "$HOME/.foundry/keystores/$DEPLOYER_KEYSTORE_ACCOUNT" ] \
  || fail "no keystore at ~/.foundry/keystores/$DEPLOYER_KEYSTORE_ACCOUNT"
# foundry.toml reads these two. cast takes ETH_RPC_URL and forge takes the `sepolia` alias,
# so the keyed URL never appears in argv.
export SEPOLIA_RPC_URL ETHERSCAN_API_KEY ETH_RPC_URL="$SEPOLIA_RPC_URL"

node --input-type=module -e "await import('prettier')" 2>/dev/null \
  || fail "run yarn install in dapp/ first; the ABI export after the deploy needs it"

chain_id=$(cast chain-id)
[ "$chain_id" = "$SEPOLIA_CHAIN_ID" ] || fail "SEPOLIA_RPC_URL answers chain id $chain_id, not $SEPOLIA_CHAIN_ID"

echo "-- Normative and boundary tests"
test_out=$(forge test --match-contract 'NormativeCasesTest|Boundaries' 2>&1) || { echo "$test_out"; fail "tests failed"; }
for suite in test/NormativeCases.t.sol:NormativeCasesTest test/Boundaries.t.sol:Boundaries; do
  grep -qF "tests for $suite" <<<"$test_out" || { echo "$test_out"; fail "suite $suite did not run; is it missing?"; }
done
grep -E "^Ran |Suite result" <<<"$test_out"

initcode=$(forge inspect ThreatFlagLog bytecode)
predicted=$(cast compute-address "$PROXY" --salt "$SALT" --init-code "$initcode" | grep -oE '0x[0-9a-fA-F]{40}')
[ "$(cast code "$PROXY")" != 0x ] || fail "the deterministic deployment proxy $PROXY has no code on this chain"
[ "$(cast code "$predicted")" = 0x ] || fail "code already exists at the predicted address $predicted"

deployer=$(cast wallet address --account "$DEPLOYER_KEYSTORE_ACCOUNT")
balance=$(cast balance "$deployer")
gas_price=$(cast gas-price)
deploy_gas=$(cast estimate --from "$deployer" "$PROXY" "$(cast concat-hex "$SALT" "$initcode")")
cost=$(node -p "((BigInt($deploy_gas) + BigInt($SMOKE_GAS)) * BigInt($gas_price)).toString()")

echo
echo "Predicted address: $predicted"
echo "Deployer:          $deployer"
echo "Balance:           $(cast to-unit "$balance" ether) ETH"
echo "Gas price now:     $(cast to-unit "$gas_price" gwei) gwei"
echo "Gas:               deploy $deploy_gas (cast estimate), smoke about $SMOKE_GAS"
echo "Estimated cost:    $(cast to-unit "$cost" ether) ETH"
[ "$(node -p "BigInt('$balance') > 0n && BigInt('$balance') >= BigInt('$cost')")" = true ] \
  || fail "deployer balance does not cover the estimated cost"
echo
read -r -p "Type DEPLOY to broadcast to Sepolia from $deployer: " answer
[ "$answer" = DEPLOY ] || fail "not confirmed"

failed=""
echo "== Deploy, then verify on Etherscan"
forge script script/Deploy.s.sol --rpc-url sepolia --account "$DEPLOYER_KEYSTORE_ACCOUNT" --broadcast --verify \
  || failed="$failed etherscan-or-deploy"
[ "$(cast code "$predicted")" != 0x ] || fail "no code at $predicted after the broadcast"
node scripts-js/generateTsAbis.js || failed="$failed abi-export"

echo "== Verify on Sourcify"
forge verify-contract "$predicted" contracts/ThreatFlagLog.sol:ThreatFlagLog \
  --chain "$SEPOLIA_CHAIN_ID" --verifier sourcify --watch || failed="$failed sourcify"

echo "== Smoke append"
forge script script/Smoke.s.sol --rpc-url sepolia --account "$DEPLOYER_KEYSTORE_ACCOUNT" --broadcast || failed="$failed smoke"
writer_seq=$(cast call "$predicted" 'writerSeq(address)(uint64)' "$deployer")
global_seq=$(cast call "$predicted" 'globalSeq()(uint64)')
[ "$writer_seq" = 1 ] || failed="$failed writerSeq=$writer_seq"
[ "$global_seq" = 1 ] || failed="$failed globalSeq=$global_seq"

tx_hash() { jq -r '.transactions[0].hash' "broadcast/$1/$SEPOLIA_CHAIN_ID/run-latest.json" 2>/dev/null || echo unknown; }
echo
echo "Address:           $predicted"
echo "Runtime code hash: $(cast keccak "$(cast code "$predicted")")"
echo "Deploy tx:         $(tx_hash Deploy.s.sol)"
echo "Smoke tx:          $(tx_hash Smoke.s.sol)"
echo "writerSeq(deployer) = $writer_seq, globalSeq() = $global_seq"

if [ -n "$failed" ]; then
  cat >&2 <<EOF

FAILED:$failed
The contract is deployed, so do not rerun this script. Retry the failed step from $PKG:
  forge verify-contract $predicted contracts/ThreatFlagLog.sol:ThreatFlagLog --chain $SEPOLIA_CHAIN_ID --verifier etherscan --watch
  forge verify-contract $predicted contracts/ThreatFlagLog.sol:ThreatFlagLog --chain $SEPOLIA_CHAIN_ID --verifier sourcify --watch
  forge script script/Smoke.s.sol --rpc-url sepolia --account $DEPLOYER_KEYSTORE_ACCOUNT --broadcast
EOF
  exit 1
fi
echo "Done: deployed at the predicted address, verified on Etherscan and Sourcify, smoke append confirmed."
