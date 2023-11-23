// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from './interfaces/IERCXXXX.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import { LinkedLists } from './libraries/LinkedLists.sol';

// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is IERCXXXX, ERC1155Holder {
    using LinkedLists for LinkedLists.Lists;
    using LinkedLists for LinkedLists.RoleAssignment;
    using LinkedLists for LinkedLists.DepositInfo;

    LinkedLists.Lists internal lists;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        _;
    }

    modifier onlyOwnerOrApprovedWithBalance(
        address _account,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) {
        require(_tokenAmount > 0, 'SftRolesRegistry: tokenAmount must be greater than zero');
        require(
            _account == msg.sender || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'SftRolesRegistry: account not approved'
        );
        _;
    }

    /** External Functions **/

    function grantRoleFrom(
        RoleAssignment calldata _roleAssignmentData
    )
        external
        override
        validExpirationDate(_roleAssignmentData.expirationDate)
        onlyOwnerOrApprovedWithBalance(
            _roleAssignmentData.grantor,
            _roleAssignmentData.tokenAddress,
            _roleAssignmentData.tokenId,
            _roleAssignmentData.tokenAmount
        )
    {
        bytes32 hash = _hashRoleData(
            _roleAssignmentData.depositId,
            _roleAssignmentData.role,
            _roleAssignmentData.tokenAddress,
            _roleAssignmentData.tokenId,
            _roleAssignmentData.grantor
        );

        bytes32 _headKey = _getHeadKey(
            _roleAssignmentData.grantor,
            _roleAssignmentData.tokenAddress,
            _roleAssignmentData.tokenId
        );
        bytes32 _roleRootKey = lists.rolesHeads[_headKey];

        bytes32 _roleId = _getRoleId(_roleAssignmentData.depositId, _roleAssignmentData.role);
        LinkedLists.RoleAssignment storage _roleAssignment = lists.roleAssignments[_roleId];


        // check if deposit exists
        if (lists.deposits[_roleAssignmentData.depositId].data.tokenAmount == 0) {
            _transferFrom(
                _roleAssignmentData.grantor,
                address(this),
                _roleAssignmentData.tokenAddress,
                _roleAssignmentData.tokenId,
                _roleAssignmentData.tokenAmount
            );

            _insertDeposit(_headKey, _roleAssignmentData);
        } else {
            // if deposit exists, check if data is valid
            require(_roleAssignment.data.hash == hash, 'SftRolesRegistry: nonce exist, but data mismatch'); // validates nonce, role, tokenAddress, tokenId, grantor
            require(
                _roleAssignment.data.expirationDate < block.timestamp || _roleAssignment.data.revocable,
                'SftRolesRegistry: nonce is not expired or is not revocable'
            );
            require(
                _roleAssignment.data.tokenAmount == _roleAssignmentData.tokenAmount,
                'SftRolesRegistry: nonce exist, but tokenAmount mismatch'
            );

            // remove from the list
            lists.removeRoleAssignment(_roleRootKey, _roleId);
        }

        // insert new role assignment to be sorted by expiration date
        _insertRoleAssignment(hash, _roleRootKey, _roleAssignmentData);
    }

    function _insertDeposit(bytes32 _rootKey, RoleAssignment memory _roleAssignmentData) internal {
        IERCXXXX.DepositData memory _depositData = IERCXXXX.DepositData(
            _roleAssignmentData.depositId,
            _roleAssignmentData.tokenAddress,
            _roleAssignmentData.tokenId,
            _roleAssignmentData.tokenAmount
        );

        lists.insert(_rootKey, _depositData.depositId, _depositData);

        emit TokenDeposited(
            _depositData.depositId,
            _depositData.tokenAddress,
            _depositData.tokenId,
            _depositData.tokenAmount
        );
    }

    function _insertRoleAssignment(bytes32 _hash, bytes32 _rootKey, RoleAssignment calldata _roleAssignment) internal {
        RoleData memory data = RoleData(
            _hash,
            _roleAssignment.grantee,
            _roleAssignment.tokenAmount,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );

        bytes32 _roleId = _getRoleId(_roleAssignment.depositId, _roleAssignment.role);
        lists.insert(_rootKey, _roleId, data);

        emit RoleGranted(
            _roleAssignment.depositId,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount,
            _roleAssignment.grantor,
            _roleAssignment.grantee,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );
    }

    function revokeRoleFrom(RevokeRoleData calldata _revokeRoleData) external override {
        bytes32 _roleId = keccak256(abi.encodePacked(_revokeRoleData.depositId, _revokeRoleData.role));
        LinkedLists.RoleAssignment memory roleAssignment = lists.roleAssignments[_roleId];
        address _grantee = roleAssignment.data.grantee;
        require(
            roleAssignment.data.hash == _hashRoleData(_revokeRoleData),
            'SftRolesRegistry: could not find role assignment'
        );

        address caller = _findCaller(_revokeRoleData, _grantee);
        if (roleAssignment.data.expirationDate > block.timestamp && !roleAssignment.data.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _grantee, 'SftRolesRegistry: role is not revocable or caller is not the approved');
        }

        uint256 tokensToReturn = roleAssignment.data.tokenAmount;

        bytes32 _depositRootKey = _getHeadKey(_revokeRoleData.revoker, _revokeRoleData.tokenAddress, _revokeRoleData.tokenId);
        bytes32 _rolesRootKey = lists.rolesHeads[_depositRootKey];

        // if is the last role assignment, remove the deposit
        if (roleAssignment.next == bytes32(0)) {
            _transferFrom(
                address(this),
                _revokeRoleData.revoker,
                _revokeRoleData.tokenAddress,
                _revokeRoleData.tokenId,
                tokensToReturn
            );
            // if is the last role assignment, remove the deposit
            lists.removeDeposit(_depositRootKey, _revokeRoleData.depositId);

            emit TokenWithdrawn(
                _revokeRoleData.depositId,
                _revokeRoleData.tokenAddress,
                _revokeRoleData.tokenId,
                tokensToReturn
            );
        }

        // remove from the list
        lists.removeRoleAssignment(_rolesRootKey, _roleId);

        emit RoleRevoked(
            _revokeRoleData.depositId,
            _revokeRoleData.role,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            tokensToReturn,
            _revokeRoleData.revoker,
            _grantee
        );
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function roleData(uint256 _depositId, bytes32 _role) external view returns (RoleData memory) {
        bytes32 _roleId = keccak256(abi.encodePacked(_depositId, _role));
        return lists.roleAssignments[_roleId].data;
    }

    function roleExpirationDate(uint256 _nonce, bytes32 _role) external view returns (uint64 expirationDate_) {
        bytes32 _roleId = keccak256(abi.encodePacked(_nonce, _role));
        return lists.roleAssignments[_role].data.expirationDate;
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
    }

    function roleBalanceOf(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (uint256 balance_) {
        bytes32 rootKey = _getHeadKey(_grantor, _tokenAddress, _tokenId);
        uint256 currentDepositId = lists.depositsHeads[rootKey];
        bytes32 currentRoleAssignmentId = lists.rolesHeads[_getRoleId(currentDepositId, _role)];

        if (currentDepositId == 0 || currentRoleAssignmentId == bytes32(0)) {
            return 0;
        }

        balance_ = 0;
        LinkedLists.DepositInfo storage currentDeposit;
        LinkedLists.RoleAssignment memory roleAssignment;

        while (currentDepositId != 0) {
            currentDeposit = lists.deposits[currentDepositId];
            roleAssignment = lists.roleAssignments[currentRoleAssignmentId];

            if (roleAssignment.data.expirationDate > block.timestamp && roleAssignment.data.grantee == _grantee) {
                balance_ += currentDeposit.data.tokenAmount;
            }

            currentRoleAssignmentId = lists.roleAssignments[currentRoleAssignmentId].next;
            currentDepositId = currentDeposit.next;
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155Receiver, IERC165) returns (bool) {
        return interfaceId == type(IERCXXXX).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    /** Helper Functions **/

    function _transferFrom(
        address _from,
        address _to,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) internal {
        IERC1155(_tokenAddress).safeTransferFrom(_from, _to, _tokenId, _tokenAmount, '');
    }

    function _hashRoleData(RevokeRoleData calldata _revokeRoleData) internal pure returns (bytes32) {
        return
            _hashRoleData(
                _revokeRoleData.depositId,
                _revokeRoleData.role,
                _revokeRoleData.tokenAddress,
                _revokeRoleData.tokenId,
                _revokeRoleData.revoker
            );
    }

    function _hashRoleData(
        uint256 _nonce,
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(_nonce, _role, _tokenAddress, _tokenId, _grantor));
    }

    function _findCaller(RevokeRoleData calldata _revokeRoleData, address _grantee) internal view returns (address) {
        if (
            _revokeRoleData.revoker == msg.sender ||
            isRoleApprovedForAll(_revokeRoleData.tokenAddress, _revokeRoleData.revoker, msg.sender)
        ) {
            return _revokeRoleData.revoker;
        }

        if (_grantee == msg.sender || isRoleApprovedForAll(_revokeRoleData.tokenAddress, _grantee, msg.sender)) {
            return _grantee;
        }

        revert('SftRolesRegistry: sender must be approved');
    }

    function _getRoleId(uint256 _depositId, bytes32 _role) internal pure returns (bytes32 rootKey_) {
        return keccak256(abi.encodePacked(_depositId, _role));
    }

    function _getHeadKey(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId
    ) internal pure returns (bytes32 rootKey_) {
        return keccak256(abi.encodePacked(_grantor, _tokenAddress, _tokenId));
    }
}
