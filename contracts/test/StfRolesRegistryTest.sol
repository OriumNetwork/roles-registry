// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SetupTest } from "./SetupTest.sol";
import { IERCXXXX } from "../RolesRegistry/interfaces/IERCXXXX.sol";

contract SftRolesRegistryTest is SetupTest {

    function test_grantRoleFrom(IERCXXXX.RoleAssignment memory _roleAssignment) public {
        // TODO
        _roleAssignment.tokenAddress = address(mockERC1155);
        mockERC1155.mint(_roleAssignment.grantor, _roleAssignment.tokenId, _roleAssignment.tokenAmount);
        mockERC1155.setApprovalForAll(address(sftRolesRegistry), true);
        sftRolesRegistry.grantRoleFrom(_roleAssignment);
    }

}