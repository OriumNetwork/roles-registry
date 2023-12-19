// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SetupTest } from './SetupTest.sol';
import { IERCXXXX } from '../RolesRegistry/interfaces/IERCXXXX.sol';

contract SftRolesRegistryTest is SetupTest {
    function testFuzz_grantRoleFrom(
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

        uint256 _roleBalance = sftRolesRegistry.roleBalanceOf(role, address(mockERC1155), tokenId, grantee);
        assertEq(_roleBalance, tokenAmount);
    }

    function testFuzz_revokeRoleFrom(
        uint256 nonce,
        bytes32 role,
        uint256 tokenId,
        uint256 tokenAmount,
        address grantee,
        uint64 expirationDate,
        bool revocable
    ) public {
        testFuzz_grantRoleFrom(nonce, role, tokenId, tokenAmount, grantee, expirationDate, revocable, '');

        IERCXXXX.RevokeRoleData memory _revokeRoleData = IERCXXXX.RevokeRoleData({
            nonce: nonce,
            role: role,
            tokenAddress: address(mockERC1155),
            tokenId: tokenId,
            grantor: msg.sender
        });

        vm.startPrank(grantee);
        sftRolesRegistry.revokeRoleFrom(_revokeRoleData);
        vm.stopPrank();

        uint256 _roleBalance = sftRolesRegistry.roleBalanceOf(role, address(mockERC1155), tokenId, grantee);
        assertEq(_roleBalance, 0);
    }

    function testFuzz_expirationDate(
        uint256 nonce,
        bytes32 role,
        uint256 tokenId,
        uint256 tokenAmount,
        address grantee,
        uint64 expirationDate,
        bool revocable
    ) public {
        testFuzz_grantRoleFrom(nonce, role, tokenId, tokenAmount, grantee, expirationDate, revocable, '');
        uint256 _duration = expirationDate - block.timestamp;
        skip(_duration + 1);
        uint256 _roleBalance = sftRolesRegistry.roleBalanceOf(role, address(mockERC1155), tokenId, grantee);
        assertEq(_roleBalance, 0);
    }

    struct NonceTest {
        uint256 nonce;
        uint256 tokenId;
        uint256 tokenAmount;
        address grantee;
        uint64 expirationDate;
    }

    mapping(uint256 => bool) alreadyTestedNonce;

    function testFuzz_batchGrantRoleFrom(NonceTest[] memory _nonceTest) public {
        bytes32 _role = keccak256('testFuzz_nonce');

        for (uint256 i = 0; i < _nonceTest.length; i++) {
            if (alreadyTestedNonce[_nonceTest[i].nonce]) continue;
            alreadyTestedNonce[_nonceTest[i].nonce] = true;
            vm.assume(_nonceTest[i].tokenAmount < 1000);

            testFuzz_grantRoleFrom(
                _nonceTest[i].nonce,
                _role,
                _nonceTest[i].tokenId,
                _nonceTest[i].tokenAmount,
                _nonceTest[i].grantee,
                _nonceTest[i].expirationDate,
                true,
                ''
            );
        }
    }
}
