// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { Uint64SortedLinkedListLibrary } from '../libraries/Uint64SortedLinkedListLibrary.sol';

contract MockSortedLinkedList {
    using Uint64SortedLinkedListLibrary for Uint64SortedLinkedListLibrary.List;
    using Uint64SortedLinkedListLibrary for Uint64SortedLinkedListLibrary.Item;

    Uint64SortedLinkedListLibrary.List internal list;

    function insert(uint64 _key) public {
        list.insert(_key);
    }

    function remove(uint64 _key) public {
        list.remove(_key);
    }

    function getHead() public view returns (uint256) {
        return list.head;
    }

    function getItem(uint64 _key) public view returns (uint64 prev_, uint64 next_, uint8 count_) {
        Uint64SortedLinkedListLibrary.Item storage item = list.items[_key];
        prev_ = item.prev;
        next_ = item.next;
        count_ = item.count;
    }
}
