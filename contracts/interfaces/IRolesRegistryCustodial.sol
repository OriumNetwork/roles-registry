// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from './IERC7432.sol';

interface IRolesRegistryCustodial is IERC7432 {

    /// @notice Emitted when tokens are deposited.
    /// @param _owner The owner of the NFTs.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event Deposit(
        address indexed _owner,
        address indexed _tokenAddress,
        uint256 indexed _tokenId
    );

    /// @notice Emitted when a withdrawal has been made.
    /// @param _owner The owner of the NFTs.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event Withdraw(
        address indexed _owner,
        address indexed _tokenAddress,
        uint256 indexed _tokenId
    );
    
    /// @notice Deposits an NFT into the contract.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function deposit(address _tokenAddress, uint256 _tokenId) external;

    /// @notice Withdraws an NFT from the contract.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function withdraw(address _tokenAddress, uint256 _tokenId) external;

    /// @notice Returns the owner of a deposited NFT.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address);
}
