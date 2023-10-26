// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC1155 } from '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import { Strings } from '@openzeppelin/contracts/utils/Strings.sol';

contract MockERC1155 is ERC1155 {
  using Strings for uint256;
 
  constructor() ERC1155('MockERC1155') {}

  function mint(address to, uint256 tokenId, uint256 tokenAmount) external {
    _mint(to, tokenId, tokenAmount, "");
  }

//  function tokenURI(uint256 tokenId) public pure override returns (string memory) {
//    return string(abi.encodePacked('https://example.com/', tokenId.toString()));
//  }
}
