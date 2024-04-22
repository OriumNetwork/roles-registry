// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC721Receiver } from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import { IERC4907 } from '../IERC4907.sol';

interface IWrapNFT is IERC721, IERC721Receiver, IERC4907 {
    event Stake(address msgSender, address nftAddress, uint256 tokenId);

    event Redeem(address msgSender, address nftAddress, uint256 tokenId);

    function originalAddress() external view returns (address);

    function stake(uint256 tokenId) external returns (uint256);

    function redeem(uint256 tokenId) external;
}
