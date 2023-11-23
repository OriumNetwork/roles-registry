// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from '../interfaces/IERCXXXX.sol';

/// LinkedLists allow developers to manage multiple linked lists at once.
/// all lists are identified by a head key (bytes32)
/// each list item is identified by a nonce
/// the list is sorted by the expiration date in decreasing order
library LinkedLists {
    uint256 public constant EMPTY = 0;
    bytes32 public constant EMPTY_BYTES32 = bytes32(0);
    uint16 public constant LIST_LIMIT = 2500;

    struct Lists {
        // keccak256(grantor, tokenAddress, tokenId) => depositId (for deposits)
        mapping(bytes32 => uint256) depositsHeads;
        // depositId => DepositInfo
        mapping(uint256 => DepositInfo) deposits;

        // keccak256(depositId,role) => RoleAssignment
        mapping(bytes32 => RoleAssignment) roleAssignments;
        // keccak256(grantor, tokenAddress, tokenId) => roleId (for roles)
        mapping(bytes32 => bytes32) rolesHeads;

        // headKey => size
        mapping(bytes32 => uint256) sizes;
    }

    struct DepositInfo {
        IERCXXXX.DepositData data;
        uint256 previous;
        uint256 next;
    }

    struct RoleAssignment {
        IERCXXXX.RoleData data;
        bytes32 previous;
        bytes32 next;
    }

    function insert(Lists storage _self, bytes32 _headKey, bytes32 _roleId, IERCXXXX.RoleData memory _data) internal {
        require(_roleId != EMPTY_BYTES32, 'LinkedLists: invalid roleId');
        require(_self.sizes[_headKey] < LIST_LIMIT, 'LinkedLists: list limit reached');

        bytes32 headNonce = _self.rolesHeads[_headKey];
        if (headNonce == EMPTY_BYTES32) {
            // if list is empty
            // insert as head
            _self.rolesHeads[_headKey] = _roleId;
            _self.roleAssignments[_roleId] = RoleAssignment(_data, EMPTY_BYTES32, EMPTY_BYTES32);
            _self.sizes[_headKey]++;
            return;
        }

        RoleAssignment storage headItem = _self.roleAssignments[headNonce];
        if (_data.expirationDate > headItem.data.expirationDate) {
            // if expirationDate is greater than head's expirationDate
            // update current head
            headItem.previous = _roleId;

            // insert as head
            _self.rolesHeads[_headKey] = _roleId;
            _self.roleAssignments[_roleId] = RoleAssignment(_data, EMPTY_BYTES32, headNonce);
            _self.sizes[_headKey]++;
            return;
        }

        // search where to insert
        bytes32 currentNonce = headNonce;
        while (
            _self.roleAssignments[currentNonce].next != EMPTY_BYTES32 &&
            _data.expirationDate < _self.roleAssignments[_self.roleAssignments[currentNonce].next].data.expirationDate
        ) {
            currentNonce = _self.roleAssignments[currentNonce].next;
        }
        _insertAt(_self, currentNonce, _roleId, _data);
        _self.sizes[_headKey]++;
    }

    function insert(Lists storage _self, bytes32 _headKey, uint256 _depositId, IERCXXXX.DepositData memory _data) internal {
        require(_depositId != EMPTY, 'LinkedLists: invalid depositId');
        require(_self.sizes[_headKey] < LIST_LIMIT, 'LinkedLists: list limit reached');

        uint256 headNonce = _self.depositsHeads[_headKey];
        if (headNonce == EMPTY) {
            // if list is empty
            // insert as head
            _self.depositsHeads[_headKey] = _depositId;
            _self.deposits[_depositId] = DepositInfo(_data, EMPTY, EMPTY);
            _self.sizes[_headKey]++;
            return;
        }

        // search where to insert
        uint256 currentNonce = headNonce;
        while (_self.deposits[currentNonce].next != EMPTY) {
            currentNonce = _self.deposits[currentNonce].next;
        }
        _insertAt(_self, currentNonce, _depositId, _data);
        _self.sizes[_headKey]++;
    }

    function _insertAt(
        Lists storage _self,
        bytes32 _previouRoleId,
        bytes32 _roleId,
        IERCXXXX.RoleData memory _data
    ) internal {
        RoleAssignment storage previousItem = _self.roleAssignments[_previouRoleId];
        if (previousItem.next == EMPTY_BYTES32) {
            // insert as last item
            _self.roleAssignments[_roleId] = RoleAssignment(_data, _previouRoleId, EMPTY_BYTES32);
        } else {
            // insert in the middle
            _self.roleAssignments[_roleId] = RoleAssignment(_data, _previouRoleId, previousItem.next);
            // modify next item
            _self.roleAssignments[previousItem.next].previous = _roleId;
        }
        // modify previous item
        previousItem.next = _roleId;
    }

    function _insertAt(
        Lists storage _self,
        uint256 _previousDepositId,
        uint256 _depositId,
        IERCXXXX.DepositData memory _data
    ) internal {
        DepositInfo storage previousDeposit = _self.deposits[_previousDepositId];
        if (previousDeposit.next == EMPTY) {
            // insert as last item
            _self.deposits[_depositId] = DepositInfo(_data, _previousDepositId, EMPTY);
        } else {
            // insert in the middle
            _self.deposits[_depositId] = DepositInfo(_data, _previousDepositId, previousDeposit.next);
            // modify next item
            _self.deposits[previousDeposit.next].previous = _depositId;
        }
        // modify previous item
        previousDeposit.next = _depositId;
    }

    function removeRoleAssignment(Lists storage _self, bytes32 _headKey, bytes32 _roleId) internal {
        bytes32 headNonce = _self.rolesHeads[_headKey];
        require(
            headNonce != EMPTY_BYTES32 && _self.roleAssignments[_roleId].data.expirationDate != 0,
            'LinkedLists: empty list or invalid roleId'
        );

        // only the head has previous as empty
        if (_self.roleAssignments[_roleId].previous == EMPTY_BYTES32) {
            // if item is the head
            // check if correct headKey was provided
            require(headNonce == _roleId, 'LinkedLists: invalid headKey provided');
            // remove head
            if (_self.roleAssignments[_roleId].next == EMPTY_BYTES32) {
                // list contains only one item
                delete _self.depositsHeads[_headKey];
            } else {
                // list contains more than one item
                // set new head
                bytes32 newHeadNonce = _self.roleAssignments[_roleId].next;
                _self.rolesHeads[_headKey] = newHeadNonce;
                // remove previous item of new head
                _self.roleAssignments[newHeadNonce].previous = EMPTY_BYTES32;
            }
        } else {
            // remove non-head item
            RoleAssignment storage itemToRemove = _self.roleAssignments[_roleId];
            // update previous item
            _self.roleAssignments[itemToRemove.previous].next = itemToRemove.next;
            if (itemToRemove.next != EMPTY_BYTES32) {
                // if item is not the last one
                // update next item
                _self.roleAssignments[itemToRemove.next].previous = itemToRemove.previous;
            }
        }

        // delete item from storage
        delete _self.roleAssignments[_roleId];
        _self.sizes[_headKey]--;
    }

    function removeDeposit(Lists storage _self, bytes32 _headKey, uint256 _depositId) internal {
        uint256 headNonce = _self.depositsHeads[_headKey];
        require(
            headNonce != EMPTY && _self.deposits[_depositId].data.tokenAmount != 0,
            'LinkedLists: empty list or invalid depositId'
        );

        // only the head has previous as empty
        if (_self.deposits[_depositId].previous == EMPTY) {
            // if deposit is the head
            // check if correct headKey was provided
            require(headNonce == _depositId, 'LinkedLists: invalid headKey provided');
            // remove head
            if (_self.deposits[_depositId].next == EMPTY) {
                // list contains only one deposit
                delete _self.depositsHeads[_headKey];
            } else {
                // list contains more than one deposit
                // set new head
                uint256 newHeadNonce = _self.deposits[_depositId].next;
                _self.depositsHeads[_headKey] = newHeadNonce;
                // remove previous item of new head
                _self.deposits[newHeadNonce].previous = EMPTY;
            }
        } else {
            // remove non-head deposit
            DepositInfo storage depositToRemove = _self.deposits[_depositId];
            // update previous deposit
            _self.deposits[depositToRemove.previous].next = depositToRemove.next;
            if (depositToRemove.next != EMPTY) {
                // if deposit is not the last one
                // update next deposit
                _self.deposits[depositToRemove.next].previous = depositToRemove.previous;
            }
        }

        // delete deposit from storage
        delete _self.deposits[_depositId];
        _self.sizes[_headKey]--;
    }
}
