// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SetupTest } from "./SetupTest.sol";
import { IERCXXXX } from "../RolesRegistry/interfaces/IERCXXXX.sol";

contract SftRolesRegistryTest is SetupTest {
    function test_grantRoleFrom(
        uint256 nonce,
        bytes32 role,
        uint256 tokenId,
        uint256 tokenAmount,
        address grantee,
        uint64 expirationDate,
        bool revocable,
        bytes memory data
    ) public {
        vm.assume(tokenAmount > 0);
        vm.assume(nonce > 0);
        vm.assume(expirationDate > block.timestamp + 1 days);

        IERCXXXX.RoleAssignment memory _roleAssignment = IERCXXXX.RoleAssignment({
            nonce: nonce,
            role: role,
            tokenAddress: address(mockERC1155),
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            grantor: msg.sender,
            grantee: grantee,
            expirationDate: expirationDate,
            revocable: revocable,
            data: data
        });
        
        _roleAssignment.tokenAddress = address(mockERC1155);
        vm.startPrank(msg.sender);
        mockERC1155.mint(msg.sender, _roleAssignment.tokenId, _roleAssignment.tokenAmount);
        mockERC1155.setApprovalForAll(address(sftRolesRegistry), true);
        sftRolesRegistry.grantRoleFrom(_roleAssignment);
        vm.stopPrank();
    }
}
