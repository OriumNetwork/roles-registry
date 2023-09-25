// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC1155 } from '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';

contract MockERC1155 is ERC1155 {
  constructor() ERC1155('https://example.com/{id}') {}

  function mint(address to, uint256 tokenId, uint256 amount, bytes memory data) external {
    _mint(to, tokenId, amount, data);
  }
}