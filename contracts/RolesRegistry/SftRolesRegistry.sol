// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ISftRolesRegistry } from './interfaces/ISftRolesRegistry.sol';
import { IRoleBalanceOfExtension } from './interfaces/IRoleBalanceOfExtension.sol';
import { ICommitTokensAndGrantRoleExtension } from './interfaces/ICommitTokensAndGrantRoleExtension.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import { LinkedLists } from './libraries/LinkedLists.sol';
import { EnumerableSet } from '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is
    ISftRolesRegistry,
    ERC1155Holder,
    ICommitTokensAndGrantRoleExtension,
    IRoleBalanceOfExtension
{
    using LinkedLists for LinkedLists.Lists;
    using LinkedLists for LinkedLists.ListItem;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    uint256 public commitmentCount;
    LinkedLists.Lists internal lists;

    // commitmentId => Commitment
    mapping(uint256 => Commitment) public commitments;

    // commitmentId => role => lastGrantee
    mapping(uint256 => mapping(bytes32 => address)) internal lastGrantee;

    // commitmentId => role[]
    mapping(uint256 => EnumerableSet.Bytes32Set) internal commitmentIdToRoles;

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

    function commitTokens(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) external override onlyOwnerOrApproved(_grantor, _tokenAddress) returns (uint256 commitmentId_) {
        require(_tokenAmount > 0, 'SftRolesRegistry: tokenAmount must be greater than zero');
        commitmentId_ = _createCommitment(_grantor, _tokenAddress, _tokenId, _tokenAmount);
    }

    function grantRole(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    )
        external
        override
        onlyOwnerOrApproved(commitments[_commitmentId].grantor, commitments[_commitmentId].tokenAddress)
    {
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        _grantOrUpdateRole(_commitmentId, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function revokeRole(uint256 _commitmentId, bytes32 _role, address _grantee) external override {
        uint256 itemId = _getItemId(_commitmentId, _role, _grantee);
        LinkedLists.RoleData storage data = lists.items[itemId].data;
        require(data.expirationDate > 0, 'SftRolesRegistry: could not find role assignment');

        Commitment storage commitment = commitments[_commitmentId];
        address caller = _findCaller(commitment.grantor, _grantee, commitment.tokenAddress);
        if (data.expirationDate > block.timestamp && !data.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _grantee, 'SftRolesRegistry: role is not revocable or caller is not the approved');
        }

        // remove from the list
        bytes32 headKey = _getHeadKey(_grantee, _role, commitment.tokenAddress, commitment.tokenId);
        lists.remove(headKey, itemId);

        // remove from commitmentIdToRoles
        commitmentIdToRoles[_commitmentId].remove(_role);
        delete lastGrantee[_commitmentId][_role];

        emit RoleRevoked(_commitmentId, _role, _grantee);
    }

    function releaseTokens(
        uint256 _commitmentId
    ) external onlyOwnerOrApproved(commitments[_commitmentId].grantor, commitments[_commitmentId].tokenAddress) {
        uint256 numberOfRoles = commitmentIdToRoles[_commitmentId].length();
        for (uint256 i = numberOfRoles; i > 0; i--) {
            bytes32 role = commitmentIdToRoles[_commitmentId].at(i - 1);
            address grantee = lastGrantee[_commitmentId][role];
            uint256 itemId = _getItemId(_commitmentId, role, grantee);

            LinkedLists.RoleData storage data = lists.items[itemId].data;
            require(
                data.expirationDate < block.timestamp || data.revocable,
                'SftRolesRegistry: commitment has an active non-revocable role'
            );

            // remove from list and storage
            bytes32 headKey = _getHeadKey(
                grantee,
                role,
                commitments[_commitmentId].tokenAddress,
                commitments[_commitmentId].tokenId
            );
            lists.remove(headKey, itemId);
            commitmentIdToRoles[_commitmentId].remove(role);
            delete lastGrantee[_commitmentId][role];
        }

        _transferFrom(
            address(this),
            commitments[_commitmentId].grantor,
            commitments[_commitmentId].tokenAddress,
            commitments[_commitmentId].tokenId,
            commitments[_commitmentId].tokenAmount
        );

        delete commitments[_commitmentId];
        emit TokensReleased(_commitmentId);
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        roleApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** Optional External Functions **/

    function commitTokensAndGrantRole(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external override onlyOwnerOrApproved(_grantor, _tokenAddress) returns (uint256 commitmentId_) {
        require(_tokenAmount > 0, 'SftRolesRegistry: tokenAmount must be greater than zero');
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        commitmentId_ = _createCommitment(_grantor, _tokenAddress, _tokenId, _tokenAmount);
        _grantOrUpdateRole(commitmentId_, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function roleBalanceOf(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee
    ) external view returns (uint256 balance_) {
        bytes32 headKey = _getHeadKey(_grantee, _role, _tokenAddress, _tokenId);
        uint256 currentItemId = lists.heads[headKey];

        balance_ = 0;
        LinkedLists.ListItem storage currentItem;
        while (currentItemId != 0) {
            currentItem = lists.items[currentItemId];
            if (currentItem.data.expirationDate < block.timestamp) {
                return balance_;
            }
            uint256 commitmentId = currentItem.data.commitmentId;
            balance_ += commitments[commitmentId].tokenAmount;
            currentItemId = currentItem.next;
        }
    }

    /** View Functions **/

    function grantorOf(uint256 _commitmentId) external view returns (address grantor_) {
        grantor_ = commitments[_commitmentId].grantor;
    }

    function tokenAddressOf(uint256 _commitmentId) external view returns (address tokenAddress_) {
        tokenAddress_ = commitments[_commitmentId].tokenAddress;
    }

    function tokenIdOf(uint256 _commitmentId) external view returns (uint256 tokenId_) {
        tokenId_ = commitments[_commitmentId].tokenId;
    }

    function tokenAmountOf(uint256 _commitmentId) external view returns (uint256 tokenAmount_) {
        tokenAmount_ = commitments[_commitmentId].tokenAmount;
    }

    function roleData(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee
    ) external view returns (bytes memory data_) {
        return lists.items[_getItemId(_commitmentId, _role, _grantee)].data.data;
    }

    function roleExpirationDate(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee
    ) external view returns (uint64 expirationDate_) {
        return lists.items[_getItemId(_commitmentId, _role, _grantee)].data.expirationDate;
    }

    function isRoleRevocable(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee
    ) external view returns (bool revocable_) {
        return lists.items[_getItemId(_commitmentId, _role, _grantee)].data.revocable;
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
        return
            interfaceId == type(ISftRolesRegistry).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(ICommitTokensAndGrantRoleExtension).interfaceId ||
            interfaceId == type(IRoleBalanceOfExtension).interfaceId;
    }

    /** Helper Functions **/

    function _createCommitment(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) internal returns (uint256 commitmentId_) {
        commitmentId_ = ++commitmentCount;
        commitments[commitmentId_] = Commitment(_grantor, _tokenAddress, _tokenId, _tokenAmount);
        _transferFrom(_grantor, address(this), _tokenAddress, _tokenId, _tokenAmount);
        emit TokensCommitted(_grantor, commitmentId_, _tokenAddress, _tokenId, _tokenAmount);
    }

    function _grantOrUpdateRole(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal {
        // verify if a role exist
        address latestGrantee = lastGrantee[_commitmentId][_role];
        // if exist, make sure that is expired or revocable
        uint256 itemId = _getItemId(_commitmentId, _role, latestGrantee);
        LinkedLists.RoleData storage lastRoleData = lists.items[itemId].data;
        require(
            lastRoleData.expirationDate < block.timestamp || lastRoleData.revocable,
            'SftRolesRegistry: role is not expired and is not revocable'
        );

        // insert in the list
        _insert(_commitmentId, _role, _grantee, _expirationDate, _revocable, _data);

        // store last grantee and role
        commitmentIdToRoles[_commitmentId].add(_role);
        lastGrantee[_commitmentId][_role] = _grantee;

        emit RoleGranted(_commitmentId, _role, _grantee, _expirationDate, _revocable, _data);
    }

    function _insert(
        uint256 _commitmentId,
        bytes32 _role,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal {
        bytes32 headKey = _getHeadKey(
            _grantee,
            _role,
            commitments[_commitmentId].tokenAddress,
            commitments[_commitmentId].tokenId
        );
        LinkedLists.RoleData memory data = LinkedLists.RoleData(_commitmentId, _expirationDate, _revocable, _data);
        uint256 itemId = _getItemId(_commitmentId, _role, _grantee);
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

    function _getItemId(uint256 _commitmentId, bytes32 _role, address _grantee) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_commitmentId, _role, _grantee)));
    }
}
