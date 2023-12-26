// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ISftRolesRegistry } from './interfaces/ISftRolesRegistry.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import { LinkedLists } from './libraries/LinkedLists.sol';
import { EnumerableSet } from '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is ISftRolesRegistry, ERC1155Holder {
    using LinkedLists for LinkedLists.Lists;
    using LinkedLists for LinkedLists.ListItem;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    uint256 public recordCount;
    LinkedLists.Lists internal lists;

    // recordId => Record
    mapping(uint256 => Record) public records;

    // recordId => role => lastGrantee
    mapping(uint256 => mapping(bytes32 => address)) internal lastGrantee;

    // recordId => role[]
    mapping(uint256 => EnumerableSet.Bytes32Set) internal recordIdToRoles;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public roleApprovals;

    modifier onlyOwnerOrApproved(address _account, address _tokenAddress) {
        require(
            _account == msg.sender || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'SftRolesRegistry: account not approved'
        );
        _;
    }

    /** External Functions **/

    function createRecordFrom(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) external override onlyOwnerOrApproved(_grantor, _tokenAddress) returns (uint256 recordId_) {
        require(_tokenAmount > 0, 'SftRolesRegistry: tokenAmount must be greater than zero');
        recordId_ = _createRecord(_grantor, _tokenAddress, _tokenId, _tokenAmount);
    }

    function grantRole(
        uint256 _recordId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external override onlyOwnerOrApproved(records[_recordId].grantor, records[_recordId].tokenAddress) {
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        _grantOrUpdateRole(_recordId, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function revokeRoleFrom(uint256 _recordId, bytes32 _role, address _grantee) external override {
        uint256 itemId = _getItemId(_recordId, _role, _grantee);
        LinkedLists.RoleData storage data = lists.items[itemId].data;
        require(data.expirationDate > 0, 'SftRolesRegistry: could not find role assignment');

        Record storage record = records[_recordId];
        address caller = _findCaller(record.grantor, _grantee, record.tokenAddress);
        if (data.expirationDate > block.timestamp && !data.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _grantee, 'SftRolesRegistry: role is not revocable or caller is not the approved');
        }

        // remove from the list
        bytes32 headKey = _getHeadKey(_grantee, _role, record.tokenAddress, record.tokenId);
        lists.remove(headKey, itemId);

        // remove from recordIdToRoles
        recordIdToRoles[_recordId].remove(_role);
        delete lastGrantee[_recordId][_role];

        emit RoleRevoked(_recordId, _role, _grantee);
    }

    function withdrawFrom(
        uint256 _recordId
    ) external onlyOwnerOrApproved(records[_recordId].grantor, records[_recordId].tokenAddress) {
        uint256 numberOfRoles = recordIdToRoles[_recordId].length();
        for (uint256 i = 0; i < numberOfRoles; i++) {
            bytes32 role = recordIdToRoles[_recordId].at(i);
            address grantee = lastGrantee[_recordId][role];
            uint256 itemId = _getItemId(_recordId, role, grantee);

            LinkedLists.RoleData storage data = lists.items[itemId].data;
            require(
                data.expirationDate < block.timestamp || data.revocable,
                'SftRolesRegistry: role is not expired and is not revocable'
            );

            // remove from list and storage
            bytes32 headKey = _getHeadKey(grantee, role, records[_recordId].tokenAddress, records[_recordId].tokenId);
            lists.remove(headKey, itemId);
            recordIdToRoles[_recordId].remove(role);
            delete lastGrantee[_recordId][role];
        }

        _transferFrom(
            address(this),
            records[_recordId].grantor,
            records[_recordId].tokenAddress,
            records[_recordId].tokenId,
            records[_recordId].tokenAmount
        );

        delete records[_recordId];
        emit Withdrew(_recordId);
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        roleApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function recordInfo(
        uint256 _recordId
    ) external view returns (address grantor_, address tokenAddress_, uint256 tokenId_, uint256 tokenAmount_) {
        Record memory record = records[_recordId];
        grantor_ = record.grantor;
        tokenAddress_ = record.tokenAddress;
        tokenId_ = record.tokenId;
        tokenAmount_ = record.tokenAmount;
    }

    function roleData(uint256 _recordId, bytes32 _role, address _grantee) external view returns (bytes memory data_) {
        return lists.items[_getItemId(_recordId, _role, _grantee)].data.data;
    }

    function roleExpirationDate(
        uint256 _recordId,
        bytes32 _role,
        address _grantee
    ) external view returns (uint64 expirationDate_) {
        return lists.items[_getItemId(_recordId, _role, _grantee)].data.expirationDate;
    }

    function isRoleRevocable(
        uint256 _recordId,
        bytes32 _role,
        address _grantee
    ) external view returns (bool revocable_) {
        return lists.items[_getItemId(_recordId, _role, _grantee)].data.revocable;
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return roleApprovals[_grantor][_tokenAddress][_operator];
    }

    /*function roleBalanceOf(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee
    ) external view returns (uint256 balance_) {
        bytes32 headKey = _getHeadKey(_grantee, _role, _tokenAddress, _tokenId);
        uint256 currentNonce = lists.heads[headKey];
        if (currentNonce == 0) {
            return 0;
        }

        balance_ = 0;
        LinkedLists.ListItem storage currentItem;
        while (currentNonce != 0) {
            currentItem = lists.items[currentNonce];
            if (currentItem.data.expirationDate < block.timestamp) {
                return balance_;
            }
            balance_ += currentItem.data.tokenAmount;
            currentNonce = currentItem.next;
        }
    }*/

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155Receiver, IERC165) returns (bool) {
        return interfaceId == type(ISftRolesRegistry).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    /** Helper Functions **/

    function _createRecord(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) internal returns (uint256 recordId_) {
        recordId_ = ++recordCount;
        records[recordId_] = Record(_grantor, _tokenAddress, _tokenId, _tokenAmount);
        _transferFrom(_grantor, address(this), _tokenAddress, _tokenId, _tokenAmount);
        emit RecordCreated(_grantor, recordId_, _tokenAddress, _tokenId, _tokenAmount);
    }

    function _grantOrUpdateRole(
        uint256 _recordId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal {
        // verify if a role exist
        address latestGrantee = lastGrantee[_recordId][_role];
        // if exist, make sure that is expired or revocable
        uint256 itemId = _getItemId(_recordId, _role, latestGrantee);
        LinkedLists.RoleData storage lastRoleData = lists.items[itemId].data;
        require(
            lastRoleData.expirationDate < block.timestamp || lastRoleData.revocable,
            'SftRolesRegistry: role is not expired and is not revocable'
        );

        // insert in the list
        _insert(_recordId, _role, _grantee, _expirationDate, _revocable, _data);

        // store last grantee and role
        recordIdToRoles[_recordId].add(_role);
        lastGrantee[_recordId][_role] = _grantee;

        emit RoleGranted(_recordId, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function _insert(
        uint256 _recordId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal {
        bytes32 headKey = _getHeadKey(_grantee, _role, records[_recordId].tokenAddress, records[_recordId].tokenId);
        LinkedLists.RoleData memory data = LinkedLists.RoleData(_expirationDate, _revocable, _data);
        uint256 itemId = _getItemId(_recordId, _role, _grantee);
        lists.insert(headKey, itemId, data);
    }

    function _transferFrom(
        address _from,
        address _to,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) internal {
        IERC1155(_tokenAddress).safeTransferFrom(_from, _to, _tokenId, _tokenAmount, '');
    }

    // careful with the following edge case:
    // if grantee is approved by grantor, the first one checked is returned
    // if grantor is returned instead of grantee, the grantee won't be able
    // to revoke the role assignment before the expiration date
    function _findCaller(address _grantor, address _grantee, address _tokenAddress) internal view returns (address) {
        if (_grantee == msg.sender || isRoleApprovedForAll(_tokenAddress, _grantee, msg.sender)) {
            return _grantee;
        }
        if (_grantor == msg.sender || isRoleApprovedForAll(_tokenAddress, _grantor, msg.sender)) {
            return _grantor;
        }
        revert('SftRolesRegistry: sender must be approved');
    }

    function _getHeadKey(
        address _grantee,
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_grantee, _role, _tokenAddress, _tokenId));
    }

    function _getItemId(uint256 _recordId, bytes32 _role, address _grantee) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_recordId, _role, _grantee)));
    }
}
