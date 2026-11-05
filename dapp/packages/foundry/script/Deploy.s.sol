//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { ThreatFlagLog } from "../contracts/ThreatFlagLog.sol";

/// @notice Local deploy for `yarn deploy`. The Sepolia CREATE2 deploy is ticket 06.
contract DeployScript is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        deployments.push(Deployment("ThreatFlagLog", address(new ThreatFlagLog())));
    }
}
