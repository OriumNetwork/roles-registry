// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IOriumWrapperManager {
    /** External Functions **/

    /// @notice Maps a token to a wrapped token.
    /// @param _tokenAddress The token address.
    /// @param _wrappedTokenAddress The wrapped token address.
    function mapToken(address _tokenAddress, address _wrappedTokenAddress) external;

    /// @notice Unmaps a token (removes association from storage).
    /// @param _tokenAddress The token address.
    function unmapToken(address _tokenAddress) external;

    /// @notice Sets the maximum duration for a token.
    /// @param _tokenAddress The token address.
    /// @param _maxDuration The maximum duration.
    function setMaxDuration(address _tokenAddress, uint256 _maxDuration) external;

    /// @notice Sets the marketplace address.
    /// @param _marketplaceAddress The marketplace address.
    function setMarketplaceAddress(address _marketplaceAddress) external;

    /** View Functions **/

    /// @notice Gets the marketplace address of a token.
    /// @param _tokenAddress The token address.
    /// @return The marketplace address.
    function getMarketplaceAddressOf(address _tokenAddress) external view returns (address);

    /// @notice Gets the wrapped token of a token.
    /// @param _tokenAddress The token address.
    /// @return The wrapped token address.
    function getWrappedTokenOf(address _tokenAddress) external view returns (address);

    /// @notice Gets the original token of a wrapped token.
    /// @param _wrappedTokenAddress The wrapped token address.
    /// @return The original token address.
    function getOriginalTokenOf(address _wrappedTokenAddress) external view returns (address);

    /// @notice Gets the maximum duration of a token.
    /// @param _tokenAddress The token address.
    /// @return The maximum duration.
    function getMaxDurationOf(address _tokenAddress) external view returns (uint256);
}
