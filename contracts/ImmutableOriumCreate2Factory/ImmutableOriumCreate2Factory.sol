// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

contract ImmutableOriumCreate2Factory {
    function deploy(bytes32 salt, bytes memory bytecode) external returns (address addr) {
        addr = Create2.deploy(0, salt, bytecode);
    }

    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        return Create2.computeAddress(salt, bytecodeHash, address(this));
    }

    function computeAddress(bytes32 salt, bytes32 bytecodeHash, address deployer) external pure returns (address addr) {
        addr = Create2.computeAddress(salt, bytecodeHash, deployer);
    }
}
