// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ISftRolesRegistry } from './interfaces/ISftRolesRegistry.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

// Semi-fungible token (SFT) registry with only one role (UNIQUE_ROLE)
contract SftRolesRegistrySingleRole is ISftRolesRegistry, ERC1155Holder {
    bytes32 public constant UNIQUE_ROLE = keccak256('UNIQUE_ROLE');

    uint256 public recordCount;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public roleApprovals;

    // recordId => Record
    mapping(uint256 => Record) public records;

    // recordId => role => RoleAssignment
    mapping(uint256 => mapping(bytes32 => RoleAssignment)) internal roleAssignments;

    modifier onlyOwnerOrApproved(address _account, address _tokenAddress) {
        require(
            _account == msg.sender || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'SftRolesRegistry: account not approved'
        );
        _;
    }

    modifier sameGrantee(
        uint256 _recordId,
        bytes32 _role,
        address _grantee
    ) {
        require(
            _grantee != address(0) && _grantee == roleAssignments[_recordId][_role].grantee,
            'SftRolesRegistry: grantee mismatch'
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
        require(_role == UNIQUE_ROLE, 'SftRolesRegistry: role not supported');
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        _grantOrUpdateRole(_recordId, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function revokeRoleFrom(
        uint256 _recordId, bytes32 _role, address _grantee
    ) external override sameGrantee(_recordId, _role, _grantee) {
        RoleAssignment storage roleAssignment = roleAssignments[_recordId][_role];
        Record storage record = records[_recordId];
        address caller = _findCaller(record.grantor, roleAssignment.grantee, record.tokenAddress);
        if (roleAssignment.expirationDate > block.timestamp && !roleAssignment.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == roleAssignment.grantee, 'SftRolesRegistry: role is not expired and is not revocable');
        }
        emit RoleRevoked(_recordId, _role, roleAssignment.grantee);
        delete roleAssignments[_recordId][_role];
    }

    function withdrawFrom(
        uint256 _recordId
    ) external onlyOwnerOrApproved(records[_recordId].grantor, records[_recordId].tokenAddress) {
        require(
            roleAssignments[_recordId][UNIQUE_ROLE].expirationDate < block.timestamp,
            'SftRolesRegistry: token has an active role'
        );

        delete roleAssignments[_recordId][UNIQUE_ROLE];

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

    function roleData(
        uint256 _recordId,
        bytes32 _role,
        address _grantee
    ) external view sameGrantee(_recordId, _role, _grantee) returns (RoleAssignment memory) {
        return roleAssignments[_recordId][_role];
    }

    function roleExpirationDate(
        uint256 _recordId,
        bytes32 _role,
        address _grantee
    ) external view sameGrantee(_recordId, _role, _grantee) returns (uint64 expirationDate_) {
        return roleAssignments[_recordId][_role].expirationDate;
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return roleApprovals[_grantor][_tokenAddress][_operator];
    }

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
        roleAssignments[_recordId][_role] = RoleAssignment(_grantee, _expirationDate, _revocable, _data);
        emit RoleGranted(_recordId, _role, _grantee, _expirationDate, _revocable, _data);
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

    function _findCaller(address _grantor, address _grantee, address _tokenAddress) internal view returns (address) {
        if (_grantor == msg.sender || isRoleApprovedForAll(_tokenAddress, _grantor, msg.sender)) {
            return _grantor;
        }
        if (_grantee == msg.sender || isRoleApprovedForAll(_tokenAddress, _grantee, msg.sender)) {
            return _grantee;
        }
        revert('SftRolesRegistry: sender must be approved');
    }
}
