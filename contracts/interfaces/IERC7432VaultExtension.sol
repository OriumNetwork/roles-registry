// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @title ERC-7432 Vault Extension
/// @dev See https://eips.ethereum.org/EIPS/eip-7432
/// Note: the ERC-165 identifier for this interface is 0xecd7217f.
interface IERC7432VaultExtension {
    /** Events **/

    /// @notice Emitted when an NFT is withdrawn.
    /// @param _owner The original owner of the NFT.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event Withdraw(address indexed _owner, address indexed _tokenAddress, uint256 indexed _tokenId);

    /** External Functions **/

    /// @notice Withdraw NFT back to original owner.
    /// @dev Reverts if sender is not approved or the original owner.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function withdraw(address _tokenAddress, uint256 _tokenId) external;

    /** View Functions **/

    /// @notice Retrieves the owner of a deposited NFT.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @return owner_ The owner of the token.
    function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address owner_);
}
