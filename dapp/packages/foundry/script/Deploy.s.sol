//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { ThreatFlagLog } from "../contracts/ThreatFlagLog.sol";

/// @notice Deploys ThreatFlagLog through the deterministic deployment proxy with salt zero (ERC, Deployment).
/// Used by `yarn deploy` on localhost and by scripts-sh/deploy-sepolia.sh on Sepolia.
contract DeployScript is ScaffoldETHDeploy {
    bytes32 internal constant SALT = bytes32(0);

    /// @notice The address the ERC's deployment method gives for the current build.
    function predicted() public pure returns (address) {
        return vm.computeCreate2Address(SALT, keccak256(type(ThreatFlagLog).creationCode), CREATE2_FACTORY);
    }

    function run() external ScaffoldEthDeployerRunner {
        address expected = predicted();
        console.log("Predicted ThreatFlagLog address:", expected);
        require(
            CREATE2_FACTORY.code.length > 0,
            "Deterministic deployment proxy 0x4e59b44847b379578588920cA78FbF26c0B4956C has no code on this chain"
        );
        require(
            expected.code.length == 0,
            "Code already exists at the predicted address; nothing to deploy (restart anvil for a fresh local chain)"
        );

        // A salted `new` makes forge send one transaction to CREATE2_FACTORY with data `salt ++ initcode`,
        // recorded as CREATE2 so --verify and SE-2's ABI export both find it.
        address deployed = address(new ThreatFlagLog{ salt: SALT }());

        require(deployed == expected, "Deployed address differs from the prediction");
        require(deployed.code.length > 0, "No code at the deployed address");
        console.log("Deployed ThreatFlagLog at:", deployed);
        deployments.push(Deployment("ThreatFlagLog", deployed));
    }
}
