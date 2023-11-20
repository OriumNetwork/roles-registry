// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { Test } from 'forge-std/Test.sol';
import { SftRolesRegistry } from '../RolesRegistry/SftRolesRegistry.sol';
import { MockERC1155 } from '../mocks/MockERC1155.sol';

contract SetupTest is Test {
    SftRolesRegistry public sftRolesRegistry;
    MockERC1155 public mockERC1155;

    function setUp() public virtual {
        _deployContracts();
    }

    function _deployContracts() internal {
        sftRolesRegistry = new SftRolesRegistry();
        mockERC1155 = new MockERC1155();
    }
}
