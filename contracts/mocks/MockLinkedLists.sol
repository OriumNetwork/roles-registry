// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from '../RolesRegistry/interfaces/IERCXXXX.sol';
import { LinkedLists } from '../RolesRegistry/libraries/LinkedLists.sol';

contract MockLinkedLists {
    using LinkedLists for LinkedLists.Lists;
    using LinkedLists for LinkedLists.DepositInfo;

    struct ListItem {
        uint64 expirationDate;
        uint256 previous;
        uint256 next;
    }

    LinkedLists.Lists internal lists;

    function insert(bytes32 _headKey, bytes32 _roleId, uint64 _expirationDate) external {
        // the only attribute that affects the list sorting is the expiration date
        IERCXXXX.RoleData memory data = IERCXXXX.RoleData('', address(0), 1, _expirationDate, true, '');
        lists.insert(_headKey, _roleId, data);
    }

    function remove(bytes32 _headKey, bytes32 _roleId) external {
        lists.removeRoleAssignment(_headKey, _roleId);
    }

    function getHeadNonce(bytes32 _headKey) external view returns (uint256) {
        return lists.depositsHeads[_headKey];
    }

    function getListItem(uint256 _nonce) public view returns (LinkedLists.DepositInfo memory) {
        LinkedLists.DepositInfo memory item = lists.deposits[_nonce];
        return item;
    }
}
