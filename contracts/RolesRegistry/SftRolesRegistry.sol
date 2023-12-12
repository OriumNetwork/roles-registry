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
    using LinkedLists for LinkedLists.ListItem;

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
        RoleAssignment calldata _roleAssignment
    )
        external
        override
        validExpirationDate(_roleAssignment.expirationDate)
        onlyOwnerOrApprovedWithBalance(
            _roleAssignment.grantor,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount
        )
    {
        bytes32 hash = _hashRoleData(
            _roleAssignment.nonce,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.grantor
        );
        bytes32 rootKey = _getHeadKey(
            _roleAssignment.grantee,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId
        );
        LinkedLists.ListItem storage item = lists.items[_roleAssignment.nonce];
        if (item.data.expirationDate == 0) {
            // nonce is not being used

            _transferFrom(
                _roleAssignment.grantor,
                address(this),
                _roleAssignment.tokenAddress,
                _roleAssignment.tokenId,
                _roleAssignment.tokenAmount
            );
        } else {
            // nonce is being used
            require(item.data.hash == hash, 'SftRolesRegistry: nonce exist, but data mismatch'); // validates nonce, role, tokenAddress, tokenId, grantor
            require(
                item.data.expirationDate < block.timestamp || item.data.revocable,
                'SftRolesRegistry: nonce is not expired or is not revocable'
            );

            // deposit or withdraw tokens
            _depositOrWithdrawTokens(
                _roleAssignment.tokenAddress,
                _roleAssignment.tokenId,
                _roleAssignment.grantor,
                item.data.tokenAmount,
                _roleAssignment.tokenAmount
            );

            // remove from the list
            if (item.data.grantee != _roleAssignment.grantee) {
                bytes32 oldRootKey = _getHeadKey(
                    item.data.grantee,
                    _roleAssignment.role,
                    _roleAssignment.tokenAddress,
                    _roleAssignment.tokenId
                );
                lists.remove(oldRootKey, _roleAssignment.nonce);
            } else {
                lists.remove(rootKey, _roleAssignment.nonce);
            }
        }

        // insert on the list
        _insert(hash, rootKey, _roleAssignment);
    }

    function _depositOrWithdrawTokens(
        address _tokenAddress,
        uint256 _tokenId,
        address _account,
        uint256 _depositedAmount,
        uint256 _amountRequired
    ) internal {
        if (_depositedAmount > _amountRequired) {
            // return leftover tokens
            uint256 tokensToReturn = _depositedAmount - _amountRequired;
            _transferFrom(address(this), _account, _tokenAddress, _tokenId, tokensToReturn);
        } else if (_amountRequired > _depositedAmount) {
            // deposit missing tokens
            uint256 tokensToDeposit = _amountRequired - _depositedAmount;
            _transferFrom(_account, address(this), _tokenAddress, _tokenId, tokensToDeposit);
        }
    }

    function _insert(bytes32 _hash, bytes32 _rootKey, RoleAssignment calldata _roleAssignment) internal {
        RoleData memory data = RoleData(
            _hash,
            _roleAssignment.grantee,
            _roleAssignment.tokenAmount,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );

        lists.insert(_rootKey, _roleAssignment.nonce, data);

        emit RoleGranted(
            _roleAssignment.nonce,
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
        LinkedLists.ListItem storage item = lists.items[_revokeRoleData.nonce];
        address _grantee = item.data.grantee;
        require(item.data.hash == _hashRoleData(_revokeRoleData), 'SftRolesRegistry: could not find role assignment');

        address caller = _findCaller(_revokeRoleData, _grantee);
        if (item.data.expirationDate > block.timestamp && !item.data.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _grantee, 'SftRolesRegistry: role is not revocable or caller is not the approved');
        }

        uint256 tokensToReturn = item.data.tokenAmount;

        bytes32 rootKey = _getHeadKey(
            _grantee,
            _revokeRoleData.role,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId
        );

        // remove from the list
        lists.remove(rootKey, _revokeRoleData.nonce);

        emit RoleRevoked(
            _revokeRoleData.nonce,
            _revokeRoleData.role,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            tokensToReturn,
            _revokeRoleData.revoker,
            _grantee
        );

        _transferFrom(
            address(this),
            _revokeRoleData.revoker,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            tokensToReturn
        );
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function roleData(uint256 _nonce) external view returns (RoleData memory) {
        return lists.items[_nonce].data;
    }

    function roleExpirationDate(uint256 _nonce) external view returns (uint64 expirationDate_) {
        return lists.items[_nonce].data.expirationDate;
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
        address _grantee
    ) external view returns (uint256 balance_) {
        bytes32 rootKey = _getHeadKey(_grantee, _role, _tokenAddress, _tokenId);
        uint256 currentNonce = lists.heads[rootKey];
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
                _revokeRoleData.nonce,
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

    function _getHeadKey(
        address _grantee,
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId
    ) internal pure returns (bytes32 rootKey_) {
        return keccak256(abi.encodePacked(_grantee, _role, _tokenAddress, _tokenId));
    }
}
