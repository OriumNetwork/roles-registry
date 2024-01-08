// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { LinkedLists } from '../RolesRegistry/libraries/LinkedLists.sol';

contract MockLinkedLists {
    using LinkedLists for LinkedLists.Lists;
    using LinkedLists for LinkedLists.ListItem;

    struct ListItem {
        uint64 expirationDate;
        uint256 previous;
        uint256 next;
    }

    LinkedLists.Lists internal lists;

    function insert(bytes32 _headKey, uint256 _commitmentId, uint64 _expirationDate) external {
        // the only attribute that affects the list sorting is the expiration date
        LinkedLists.RoleData memory data = LinkedLists.RoleData(_commitmentId, _expirationDate, true, '');
        lists.insert(_headKey, _commitmentId, data);
    }

    function remove(bytes32 _headKey, uint256 _commitmentId) external {
        lists.remove(_headKey, _commitmentId);
    }

    function getHeadItemId(bytes32 _headKey) external view returns (uint256) {
        return lists.heads[_headKey];
    }

    function getListItem(uint256 _commitmentId) public view returns (ListItem memory) {
        LinkedLists.ListItem memory item = lists.items[_commitmentId];
        return ListItem(item.data.expirationDate, item.previous, item.next);
    }

    function getListHead(bytes32 _headKey) external view returns (ListItem memory) {
        uint256 commitmentId = lists.heads[_headKey];
        return getListItem(commitmentId);
    }
}
