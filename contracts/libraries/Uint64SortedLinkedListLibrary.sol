// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @title Uint64SortedLinkedListLibrary
/// @dev Implementation of a linked list of uint64 keys. The list is ordered in descending order, and allows duplicates.
library Uint64SortedLinkedListLibrary {
    uint64 private constant EMPTY = 0;

    struct Item {
        uint64 prev;
        uint64 next;
        uint8 count;
    }

    struct List {
        uint64 head;
        mapping(uint64 => Item) items;
    }

    /// @notice Inserts a new item into the list.
    /// @dev It should maintain the descending order of the list.
    /// @param _self The list to insert into.
    /// @param _key The new item to be inserted.
    function insert(List storage _self, uint64 _key) internal {
        require(_key != EMPTY, 'Uint64SortedLinkedListLibrary: key cannot be zero');

        // if _key already exists, only increase counter
        if (_self.items[_key].count > 0) {
            _self.items[_key].count++;
            return;
        }

        // if _key is the highest in the list, insert as head
        if (_key > _self.head) {
            _self.items[_key] = Item(EMPTY, _self.head, 1);

            // only update the previous head if list was not empty
            if (_self.head != EMPTY) _self.items[_self.head].prev = _key;

            _self.head = _key;
            return;
        }

        // loop until position to insert is found
        uint64 _itemKey = _self.head;
        Item storage _item = _self.items[_itemKey];
        while (_key < _item.next && _item.next != EMPTY) {
            _itemKey = _item.next;
            _item = _self.items[_itemKey];
        }

        // if found item is tail, next is EMPTY
        if (_item.next == EMPTY) {
            _self.items[_key] = Item(_itemKey, EMPTY, 1);
            _item.next = _key;
            return;
        }

        // if not tail, insert between two items
        _self.items[_key] = Item(_itemKey, _item.next, 1);
        _self.items[_item.next].prev = _key;
        _item.next = _key;
    }

    /// @notice Removes an item from the list.
    /// @dev It should maintain the descending order of the list.
    /// @param _self The list to remove from.
    /// @param _key The item to be removed.
    function remove(List storage _self, uint64 _key) internal {
        Item storage _itemToUpdate = _self.items[_key];

        // if _key does not exist, return
        if (_itemToUpdate.count == 0) {
            return;
        }

        // if _key occurs more than once, just decrease counter
        if (_itemToUpdate.count > 1) {
            _itemToUpdate.count--;
            return;
        }

        // updating list

        // if _key is the head, update head to the next item
        if (_itemToUpdate.prev == EMPTY) {
            _self.head = _itemToUpdate.next;

            // only update next item if it exists (if it's not head and tail simultaneously)
            if (_itemToUpdate.next != EMPTY) _self.items[_itemToUpdate.next].prev = EMPTY;

            delete _self.items[_key];
            return;
        }

        // if _key is not head, but it is tail, update the previous item's next pointer to EMPTY
        if (_itemToUpdate.next == EMPTY) {
            _self.items[_itemToUpdate.prev].next = EMPTY;
            delete _self.items[_key];
            return;
        }

        // if not head nor tail, update both previous and next items
        _self.items[_itemToUpdate.next].prev = _itemToUpdate.prev;
        _self.items[_itemToUpdate.prev].next = _itemToUpdate.next;
        delete _self.items[_key];
    }
}
