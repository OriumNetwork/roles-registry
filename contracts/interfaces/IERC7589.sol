// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/// @title ERC-7589 Semi-Fungible Token Roles
/// @dev See https://eips.ethereum.org/EIPS/eip-7589
/// Note: the ERC-165 identifier for this interface is 0x6f831543.
interface IERC7589 is IERC165 {
    /** Events **/

    /// @notice Emitted when tokens are locked (deposited or frozen).
    /// @param _owner The owner of the tokens.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _tokenAmount The token amount.
    event TokensLocked(
        address indexed _owner,
        uint256 indexed _lockId,
        address indexed _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    );

    /// @notice Emitted when a role is granted.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @param _recipient The recipient the role.
    /// @param _expirationDate The expiration date of the role.
    /// @param _revocable Whether the role is revocable.
    /// @param _data Any additional data about the role.
    event RoleGranted(
        uint256 indexed _lockId,
        bytes32 indexed _roleId,
        address indexed _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes _data
    );

    /// @notice Emitted when a role is revoked.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @param _recipient The recipient of the role revocation.
    event RoleRevoked(uint256 indexed _lockId, bytes32 indexed _roleId, address indexed _recipient);

    /// @notice Emitted when tokens are unlocked (withdrawn or unfrozen).
    /// @param _lockId The identifier of the locked tokens.
    event TokensUnlocked(uint256 indexed _lockId);

    /// @notice Emitted when a user is approved to manage roles on behalf of another user.
    /// @param _tokenAddress The token address.
    /// @param _operator The user approved to grant and revoke roles.
    /// @param _isApproved The approval status.
    event RoleApprovalForAll(address indexed _tokenAddress, address indexed _operator, bool _isApproved);

    /** External Functions **/

    /// @notice Lock tokens (deposits on a contract or freezes balance).
    /// @param _owner The owner of the tokens.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _tokenAmount The token amount.
    /// @return lockId_ The identifier of the locked tokens.
    function lockTokens(
        address _owner,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) external returns (uint256 lockId_);

    /// @notice Grants a role to a user.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @param _recipient The recipient the role.
    /// @param _expirationDate The expiration date of the role.
    /// @param _revocable Whether the role is revocable.
    /// @param _data Any additional data about the role.
    function grantRole(
        uint256 _lockId,
        bytes32 _roleId,
        address _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external;

    /// @notice Revokes a role.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @param _recipient The recipient of the role revocation.
    function revokeRole(uint256 _lockId, bytes32 _roleId, address _recipient) external;

    /// @notice Unlocks tokens (transfer back to original owner or unfreeze it).
    /// @param _lockId The identifier of the locked tokens.
    function unlockTokens(uint256 _lockId) external;

    /// @notice Approves operator to grant and revoke roles on behalf of another user.
    /// @param _tokenAddress The token address.
    /// @param _operator The user approved to grant and revoke roles.
    /// @param _approved The approval status.
    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _approved) external;

    /** View Functions **/

    /// @notice Retrieves the owner of the tokens.
    /// @param _lockId The identifier of the locked tokens.
    /// @return owner_ The owner of the tokens.
    function ownerOf(uint256 _lockId) external view returns (address owner_);

    /// @notice Retrieves the address of the locked tokens.
    /// @param _lockId The identifier of the locked tokens.
    /// @return tokenAddress_ The token address.
    function tokenAddressOf(uint256 _lockId) external view returns (address tokenAddress_);

    /// @notice Retrieves the tokenId of the locked tokens.
    /// @param _lockId The identifier of the locked tokens.
    /// @return tokenId_ The token identifier.
    function tokenIdOf(uint256 _lockId) external view returns (uint256 tokenId_);

    /// @notice Retrieves the amount of tokens locked.
    /// @param _lockId The identifier of the locked tokens.
    /// @return tokenAmount_ The token amount.
    function tokenAmountOf(uint256 _lockId) external view returns (uint256 tokenAmount_);

    /// @notice Retrieves the custom data of a role.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @return data_ The custom data.
    function roleData(uint256 _lockId, bytes32 _roleId) external view returns (bytes memory data_);

    /// @notice Retrieves the expiration date of a role.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @return expirationDate_ The expiration date.
    function roleExpirationDate(uint256 _lockId, bytes32 _roleId) external view returns (uint64 expirationDate_);

    /// @notice Retrieves the expiration date of a role.
    /// @param _lockId The identifier of the locked tokens.
    /// @param _roleId The role identifier.
    /// @return revocable_ Whether the role is revocable or not.
    function isRoleRevocable(uint256 _lockId, bytes32 _roleId) external view returns (bool revocable_);

    /// @notice Checks if the owner approved the operator for all SFTs.
    /// @param _tokenAddress The token address.
    /// @param _owner The user that approved the operator.
    /// @param _operator The user that can grant and revoke roles.
    /// @return isApproved_ Whether the operator is approved or not.
    function isRoleApprovedForAll(
        address _tokenAddress,
        address _owner,
        address _operator
    ) external view returns (bool isApproved_);
}
