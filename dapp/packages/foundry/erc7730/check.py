"""Check the ThreatFlagLog ERC-7730 descriptors before deploy.

1. Official JSON schema (erc7730-v2.schema.json from the registry).
2. Enums equal the spec tables.
3. erc7730 v2 linter, with the reference ABI taken from the local Forge artifact
   instead of Sourcify/Etherscan (the address has no code yet).
usage: check7730.py <schema.json> <forge-artifact.json> <descriptor.json>...
"""

import json
import sys
from pathlib import Path

import jsonschema
from pydantic import TypeAdapter

from erc7730.common import client
from erc7730.lint.v2.lint import lint_all_and_print_errors
from erc7730.model.abi import ABI

schema_path, artifact_path, *descriptors = map(Path, sys.argv[1:])

CATEGORIES = {"1": "POISONING_OPERATOR", "2": "POISONING_FUNDER", "3": "DRAINER_RECEIVER",
              "4": "MALICIOUS_DELEGATE", "5": "MALICIOUS_TOKEN", "6": "PAID_LOOKALIKE",
              "7": "DRAINER_SPENDER", "8": "THEFT_PROCEEDS"}
OPS = {"0": "FLAG", "1": "TOMBSTONE", "2": "COUNTER", "3": "DISPUTE"}

schema = json.loads(schema_path.read_text())
validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
for d in descriptors:
    doc = json.loads(d.read_text())
    errors = list(validator.iter_errors(doc))
    for e in errors:
        print(f"schema error in {d.name}: {e.json_path}: {e.message}")
    assert not errors, f"{d.name} fails schema {schema['version']}"
    assert doc["metadata"]["enums"] == {"category": CATEGORIES, "op": OPS}, f"{d.name} enums differ from the spec"
    print(f"{d.name}: schema {schema['version']} ok, enums equal spec tables")

abis = TypeAdapter(list[ABI]).validate_json(json.dumps(json.loads(artifact_path.read_text())["abi"]))
client.get_contract_abis = lambda chain_id, address: abis


def no_explorer(chain_id, address):
    raise NotImplementedError


client.get_contract_explorer_url = no_explorer
sys.exit(0 if lint_all_and_print_errors(descriptors, False) else 1)
