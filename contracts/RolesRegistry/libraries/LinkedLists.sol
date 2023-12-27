// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ISftRolesRegistry } from '../interfaces/ISftRolesRegistry.sol';

/// LinkedLists allow developers to manage multiple linked lists simultaneously.
/// All lists are identified by a head key (bytes32), and items by an itemId (uint256).
/// Lists are ordered by descending expiration date.
library LinkedLists {
    uint256 public constant EMPTY = 0;

    struct RoleData {
        uint256 commitmentId;
        uint64 expirationDate;
        bool revocable;
        bytes data;
    }

    struct ListItem {
        RoleData data;
        uint256 previous;
        uint256 next;
    }

    struct Lists {
        // headKey => itemId
        mapping(bytes32 => uint256) heads;
        // hash(commitmentId, role, grantee) => item
        mapping(uint256 => ListItem) items;
    }

    function insert(Lists storage _self, bytes32 _headKey, uint256 _itemId, RoleData memory _data) internal {
        require(_itemId != EMPTY, 'LinkedLists: invalid itemId');

        uint256 headItemId = _self.heads[_headKey];
        if (headItemId == EMPTY) {
            // if list is empty
            // insert as head
            _self.heads[_headKey] = _itemId;
            _self.items[_itemId] = ListItem(_data, EMPTY, EMPTY);
            return;
        }

        ListItem storage headItem = _self.items[headItemId];
        if (_data.expirationDate > headItem.data.expirationDate) {
            // if expirationDate is greater than head's expirationDate
            // update current head
            headItem.previous = _itemId;

            // insert as head
            _self.heads[_headKey] = _itemId;
            _self.items[_itemId] = ListItem(_data, EMPTY, headItemId);
            return;
        }

        // search where to insert
        uint256 currentItemId = headItemId;
        while (
            _self.items[currentItemId].next != EMPTY &&
            _data.expirationDate < _self.items[_self.items[currentItemId].next].data.expirationDate
        ) {
            currentItemId = _self.items[currentItemId].next;
        }
        _insertAt(_self, currentItemId, _itemId, _data);
    }

    function _insertAt(
        Lists storage _self,
        uint256 _previousItemId,
        uint256 _dataItemId,
        RoleData memory _data
    ) internal {
        ListItem storage previousItem = _self.items[_previousItemId];
        if (previousItem.next == EMPTY) {
            // insert as last item
            _self.items[_dataItemId] = ListItem(_data, _previousItemId, EMPTY);
        } else {
            // insert in the middle
            _self.items[_dataItemId] = ListItem(_data, _previousItemId, previousItem.next);
            // modify next item
            _self.items[previousItem.next].previous = _dataItemId;
        }
        // modify previous item
        previousItem.next = _dataItemId;
    }

    function remove(Lists storage _self, bytes32 _headKey, uint256 _itemId) internal {
        uint256 headItemId = _self.heads[_headKey];
        require(
            headItemId != EMPTY && _self.items[_itemId].data.expirationDate != 0,
            'LinkedLists: empty list or invalid itemId'
        );

        // only the head has previous as empty
        if (_self.items[_itemId].previous == EMPTY) {
            // if item is the head
            // check if correct headKey was provided
            require(headItemId == _itemId, 'LinkedLists: invalid headKey provided');
            // remove head
            if (_self.items[_itemId].next == EMPTY) {
                // list contains only one item
                delete _self.heads[_headKey];
            } else {
                // list contains more than one item
                // set new head
                uint256 newHeadItemId = _self.items[_itemId].next;
                _self.heads[_headKey] = newHeadItemId;
                // remove previous item of new head
                _self.items[newHeadItemId].previous = EMPTY;
            }
        } else {
            // remove non-head item
            ListItem storage itemToRemove = _self.items[_itemId];
            // update previous item
            _self.items[itemToRemove.previous].next = itemToRemove.next;
            if (itemToRemove.next != EMPTY) {
                // if item is not the last one
                // update next item
                _self.items[itemToRemove.next].previous = itemToRemove.previous;
            }
        }

        // delete item from storage
        delete _self.items[_itemId];
    }
}
