// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SftRolesRegistry } from '../RolesRegistry/SftRolesRegistry.sol';

contract MockSftRolesRegistry is SftRolesRegistry {
    function getListSize(bytes32 _headKey) external view returns (uint256) {
        return lists.sizes[_headKey];
    }
}