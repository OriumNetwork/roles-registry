// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC7432 } from "./ERC7432.sol";

contract RolesRegistry is ERC7432 {

    function lastGrantee(bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantor) external view returns (address) {
        return latestGrantees[_grantor][_tokenAddress][_tokenId][_role];
    }
}
