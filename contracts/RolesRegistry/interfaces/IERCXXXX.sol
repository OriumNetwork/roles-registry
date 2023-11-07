// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title ERC-XXXX Semi-Fungible Token Roles
/// @dev See https://eips.ethereum.org/EIPS/eip-XXXX
/// Note: the ERC-165 identifier for this interface is 0xTBD
interface IERCXXXX is IERC165 {
    struct RoleData {
        address grantor;
        uint256 tokenAmount;
        uint64 expirationDate;
        bool revocable;
        bytes data;
    }

    struct RoleAssignment {
        uint256 nonce;
        bytes32 role;
        address tokenAddress;
        uint256 tokenId;
        uint256 tokenAmount;
        address grantor;
        address grantee;
        uint64 expirationDate;
        bool revocable;
        bytes data;
    }

    struct RevokeRoleData {
        uint256 nonce;
        bytes32 role;
        address tokenAddress;
        uint256 tokenId;
        uint256 tokenAmount;
        address revoker;
        address grantee;
    }

    /** Events **/

    /// @notice Emitted when a role is granted.
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _tokenAmount The token amount.
    /// @param _grantor The user assigning the role.
    /// @param _grantee The user receiving the role.
    /// @param _expirationDate The expiration date of the role.
    /// @param _revocable Whether the role is revocable or not.
    /// @param _data Any additional data about the role.
    event RoleGranted(
        uint256 indexed _nonce,
        bytes32 indexed _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes _data
    );

    /// @notice Emitted when a role is revoked.
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _tokenAmount The token amount.
    /// @param _revoker The user revoking the role.
    /// @param _grantee The user that receives the role revocation.
    event RoleRevoked(
        bytes32 indexed _role,
        address indexed _tokenAddress,
        uint256 indexed _tokenId,
        uint256 _tokenAmount,
        address _revoker,
        address _grantee
    );

    /// @notice Emitted when a user is approved to manage any role on behalf of another user.
    /// @param _tokenAddress The token address.
    /// @param _operator The user approved to grant and revoke roles.
    /// @param _isApproved The approval status.
    event RoleApprovalForAll(
        address indexed _tokenAddress,
        address indexed _operator,
        bool _isApproved
    );

    /** External Functions **/

    /// @notice Grants a role on behalf of a user.
    /// @param _roleAssignment The role assignment data.
    function grantRoleFrom(RoleAssignment calldata _roleAssignment) external;

    /// @notice Revokes a role on behalf of a user.
    /// @param _revokeRoleData The struct with all the revocation data.
    function revokeRoleFrom(RevokeRoleData calldata _revokeRoleData) external;

    /// @notice Approves operator to grant and revoke any roles on behalf of another user.
    /// @param _tokenAddress The token address.
    /// @param _operator The user approved to grant and revoke roles.
    /// @param _approved The approval status.
    function setRoleApprovalForAll(
        address _tokenAddress,
        address _operator,
        bool _approved
    ) external;

    /** View Functions **/

    /// @notice Returns the custom data of a role assignment.
    /// @param _recordId The identifier of the record.
//    function roleData(uint256 _recordId) external view returns (RoleData memory data_);
//    function roleData(address _tokenAddress, uint256 _recordId) external view returns (RoleData memory data_);

    /// @notice Returns the expiration date of a role assignment.
    /// @param _recordId The identifier of the record.
//    function roleExpirationDate(uint256 _recordId) external view returns (uint64 expirationDate_);

    /// @notice Checks if the grantor approved the operator for all NFTs.
    /// @param _tokenAddress The token address.
    /// @param _grantor The user that approved the operator.
    /// @param _operator The user that can grant and revoke roles.
    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) external view returns (bool);

}
