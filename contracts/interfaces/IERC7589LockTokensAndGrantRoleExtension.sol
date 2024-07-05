// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @title ERC-7589 Semi-Fungible Token Roles, optional lock tokens and grant role extension
/// @dev See https://eips.ethereum.org/EIPS/eip-7589
/// Note: the ERC-165 identifier for this interface is 0x0a644ace.
interface IERC7589LockTokensAndGrantRoleExtension {
    /// @notice Lock tokens and grant role in a single transaction.
    /// @param _owner The owner of the tokens.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _tokenAmount The token amount.
    /// @param _roleId The role identifier.
    /// @param _recipient The recipient the role.
    /// @param _expirationDate The expiration date of the role.
    /// @param _revocable Whether the role is revocable.
    /// @param _data Any additional data about the role.
    /// @return lockId_ The identifier of the locked tokens.
    function lockTokensAndGrantRole(
        address _owner,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        bytes32 _roleId,
        address _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external returns (uint256 lockId_);
}
