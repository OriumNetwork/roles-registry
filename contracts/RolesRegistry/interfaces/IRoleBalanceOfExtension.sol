// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IRoleBalanceOfExtension {
    /// @notice Returns the sum of all tokenAmounts granted to the grantee for the given role.
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _grantee The user for which the balance is returned.
    /// @return balance_ The balance of the grantee for the given role.
    function roleBalanceOf(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee
    ) external returns (uint256 balance_);
}
