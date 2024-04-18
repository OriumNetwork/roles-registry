// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { Initializable } from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { IOriumWrapperManager } from './interfaces/IOriumWrapperManager.sol';

contract OriumWrapperManager is Initializable, OwnableUpgradeable, IOriumWrapperManager {
    address public marketplaceAddress;

    // tokenAddress => wrappedTokenAddress
    mapping(address => address) public wrappedTokenOf;

    // wrappedTokenAddress => tokenAddress
    mapping(address => address) public originalTokenOf;

    // tokenAddress => maxDuration
    mapping(address => uint256) public maxDurationOf;

    /** External Functions **/

    function initialize(address _owner, address _marketplaceAddress) external initializer {
        __Ownable_init();
        transferOwnership(_owner);
        marketplaceAddress = _marketplaceAddress;
    }

    function setMarketplaceAddress(address _marketplaceAddress) external onlyOwner {
        marketplaceAddress = _marketplaceAddress;
    }

    function mapToken(address _tokenAddress, address _wrappedTokenAddress) external onlyOwner {
        wrappedTokenOf[_tokenAddress] = _wrappedTokenAddress;
        originalTokenOf[_wrappedTokenAddress] = _tokenAddress;
    }

    function unmapToken(address _tokenAddress) external onlyOwner {
        address _wrappedTokenAddress = wrappedTokenOf[_tokenAddress];
        delete wrappedTokenOf[_tokenAddress];
        delete originalTokenOf[_wrappedTokenAddress];
    }

    function setMaxDuration(address _tokenAddress, uint256 _maxDuration) external onlyOwner {
        maxDurationOf[_tokenAddress] = _maxDuration;
    }

    /** View Functions **/

    function getMarketplaceAddressOf(address _tokenAddress) external view override returns (address) {
        return marketplaceAddress;
    }

    function getWrappedTokenOf(address _tokenAddress) external view returns (address) {
        return wrappedTokenOf[_tokenAddress];
    }

    function getOriginalTokenOf(address _wrappedTokenAddress) external view returns (address) {
        return originalTokenOf[_wrappedTokenAddress];
    }

    function getMaxDurationOf(address _tokenAddress) external view returns (uint256) {
        return maxDurationOf[_tokenAddress];
    }
}
