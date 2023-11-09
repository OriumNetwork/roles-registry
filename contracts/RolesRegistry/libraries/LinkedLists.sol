// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from "../interfaces/IERCXXXX.sol";

/// LinkedListsLib allow developers to manage multiple linked lists at once.
/// all lists are identified by a header key (bytes32)
/// each list item is identified by a nonce
/// the list is sorted by the expiration date in decreasing order
library LinkedLists {

    uint256 public constant EMPTY = 0;

    struct Lists {
        mapping(bytes32 => uint256) headers;
        mapping(uint256 => ListItem) items;
    }

    struct ListItem {
        IERCXXXX.RoleData data;
        uint256 previous;
        uint256 next;
    }

    // Insert =================================================================

    function insert(Lists storage _self, bytes32 _headerKey, uint256 _nonce, IERCXXXX.RoleData memory _data) internal {
        require(_nonce != EMPTY, "LinkedLists: invalid nonce");

        uint256 headerNonce = _self.headers[_headerKey];
        if (headerNonce == EMPTY) {
            // if list is empty
            // insert as header
            _self.headers[_headerKey] = _nonce;
            _self.items[_nonce] = ListItem(_data, EMPTY, EMPTY);
            return;
        }

        if (_data.expirationDate > _self.items[headerNonce].data.expirationDate) {
            // if expirationDate is greater than head's expirationDate
            // update current head
            _self.items[headerNonce].previous = _nonce;

            // insert as header
            _self.headers[_headerKey] = _nonce;
            _self.items[_nonce] = ListItem(_data, EMPTY, headerNonce);
            return;
        }

        // search where to insert
        uint256 currentNonce = headerNonce;
        while (_data.expirationDate < _self.items[currentNonce].data.expirationDate && _self.items[currentNonce].next != EMPTY) {
            currentNonce = _self.items[currentNonce].next;
        }
        insertAt(_self, currentNonce, _nonce, _data);

    }

    function insertAt(Lists storage _self, uint256 _previousNonce, uint256 _dataNonce, IERCXXXX.RoleData memory _data) internal {
        ListItem storage previousItem = _self.items[_previousNonce];
        if (previousItem.next == EMPTY) {
            // insert as last item
            _self.items[_dataNonce] =  ListItem(_data, _previousNonce, EMPTY);
        } else {
            // insert in the middle
            _self.items[_dataNonce] = ListItem(_data, _previousNonce, previousItem.next);
            // modify next item
            _self.items[previousItem.next].previous = _dataNonce;
        }
        // modify previous item
        previousItem.next = _dataNonce;
    }

    // Remove =================================================================

    function remove(Lists storage _self, bytes32 _headerKey, uint256 _nonce) internal {
        uint256 headerNonce = _self.headers[_headerKey];
        require(headerNonce != EMPTY || _nonce != EMPTY, "LinkedLists: empty list or invalid nonce");

        if (headerNonce == _nonce) {
            // remove header
            if (_self.items[_nonce].next == EMPTY) {
                // list contains only one item
                delete _self.headers[_headerKey];
            } else {
                // list contains more than one item
                ListItem storage newHeader = _self.items[headerNonce];
                // remove previous item of new header
                newHeader.previous = EMPTY;
                // set new header
                _self.headers[_headerKey] = _self.items[_nonce].next;
            }
        } else {
            // remove non-header item
            ListItem storage itemToRemove = _self.items[_nonce];
            // update previous item
            _self.items[itemToRemove.previous].next = itemToRemove.next;
            if (itemToRemove.next != EMPTY) {
                // if item is not the last one
                // update next item
                _self.items[itemToRemove.next].previous = itemToRemove.previous;
            }

        }

        // delete item from storage
        delete _self.items[_nonce];
    }

}
