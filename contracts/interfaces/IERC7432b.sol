// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432a } from './IERC7432a.sol';

/// @title ERC-7432b Non-Fungible Token Roles Custodial Interface
/// @dev See https://eips.ethereum.org/EIPS/eip-7432
/// Note: the ERC-165 identifier for this interface is 0x.
interface IERC7432b is IERC7432a {
    /// @notice Emitted when tokens are committed (deposited or frozen).
    /// @param _owner The owner of the NFTs.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event TokensCommitted(address indexed _owner, address indexed _tokenAddress, uint256 indexed _tokenId);

    /// @notice Emitted when a user releases tokens from a commitment.
    /// @param _owner The owner of the NFTs.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event TokensReleased(address indexed _owner, address indexed _tokenAddress, uint256 indexed _tokenId);

    /// @notice Releases tokens back to grantor.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function releaseTokens(address _tokenAddress, uint256 _tokenId) external;

    /// @notice Returns the owner of a deposited NFT.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address);
}
