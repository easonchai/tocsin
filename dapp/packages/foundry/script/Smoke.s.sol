//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { ThreatFlagLog } from "../contracts/ThreatFlagLog.sol";

/// @notice Post-deploy smoke test: the deployer appends one FLAG leaf, then the sequences are read back.
contract SmokeScript is Script {
    function run() external {
        // Same prediction as Deploy.s.sol: deterministic deployment proxy, salt zero, no constructor arguments.
        ThreatFlagLog log =
            ThreatFlagLog(vm.computeCreate2Address(bytes32(0), keccak256(type(ThreatFlagLog).creationCode), CREATE2_FACTORY));
        require(address(log).code.length > 0, "No ThreatFlagLog at the predicted address; deploy first");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        require(log.writerSeq(deployer) == 0, "Deployer already appended; smoke test ran before");
        uint64 globalBefore = log.globalSeq();

        // Category 128 is writer-defined noise, so no reader evaluates it unless it opts in.
        // The subject is the deployer itself, so the smoke flag names no third party.
        ThreatFlagLog.Leaf[] memory leaves = new ThreatFlagLog.Leaf[](1);
        leaves[0] = ThreatFlagLog.Leaf({
            chainId: uint64(block.chainid),
            subject: deployer,
            category: 128,
            op: 0,
            evidence: keccak256("ThreatFlagLog smoke test"),
            seenBlock: uint64(block.number),
            refLeaf: bytes32(0)
        });
        log.append(leaves);
        vm.stopBroadcast();

        uint64 writerSeq = log.writerSeq(deployer);
        uint64 globalSeq = log.globalSeq();
        console.log("writerSeq(deployer):", writerSeq);
        console.log("globalSeq():", globalSeq);
        require(writerSeq == 1, "writerSeq(deployer) != 1");
        // globalSeq == 1 holds only if nobody appended between the deploy and this smoke test.
        require(globalSeq == globalBefore + 1, "globalSeq did not advance by one");
        console.log("globalSeq before the smoke append:", globalBefore);
        require(globalSeq == 1, "globalSeq() != 1: someone appended before the smoke test");
    }
}
