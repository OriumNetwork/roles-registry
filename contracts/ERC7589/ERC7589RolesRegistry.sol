// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { IERC7589 } from '../interfaces/IERC7589.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC7589RoleBalanceOfExtension } from '../interfaces/IERC7589RoleBalanceOfExtension.sol';
import { IERC7589LockTokensAndGrantRoleExtension } from '../interfaces/IERC7589LockTokensAndGrantRoleExtension.sol';
import { Uint64SortedLinkedListLibrary } from '../libraries/Uint64SortedLinkedListLibrary.sol';
import { IOriumWrapperManager } from '../interfaces/IOriumWrapperManager.sol';

contract ERC7589RolesRegistry is IERC7589, ERC1155Holder, IERC7589LockTokensAndGrantRoleExtension {
    using Uint64SortedLinkedListLibrary for Uint64SortedLinkedListLibrary.List;

    struct TokenLock {
        address owner;
        address tokenAddress;
        uint256 tokenId;
        uint256 tokenAmount;
    }

    struct Role {
        address recipient;
        uint64 expirationDate;
        bool revocable;
        bytes data;
    }

    address public managerAddress;

    address public marketplaceAddress;

    uint256 public lockIdCount;

    // tokenAddress => isAllowed
    mapping(address => bool) public isTokenAddressAllowed;

    // lockId => TokenLock
    mapping(uint256 => TokenLock) public tokenLocks;

    // lockId => roleId => Role
    mapping(uint256 => mapping(bytes32 => Role)) public roles;

    // tokenAddress => tokenId => List
    mapping(uint256 => Uint64SortedLinkedListLibrary.List) public tokenLockExpirationDates;

    // ownerAddress => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public roleApprovals;

    // supportedInterfaces => bool
    mapping(bytes4 => bool) private supportedInterfaces;

    modifier onlyManager() {
        require(msg.sender == managerAddress, 'ERC7589RolesRegistry: sender is not manager');
        _;
    }

    modifier onlyAllowedTokenAddress(address _tokenAddress) {
        require(isTokenAddressAllowed[_tokenAddress], 'ERC7589RolesRegistry: tokenAddress is not allowed');
        _;
    }

    modifier onlyOwnerOrApproved(address _account, address _tokenAddress) {
        require(
            msg.sender == _account || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'ERC7589RolesRegistry: sender is not owner or approved'
        );
        _;
    }

    modifier onlyTokenLockOwnerOrApproved(uint256 _lockId) {
        TokenLock storage _tokenLock = tokenLocks[_lockId];
        require(
            msg.sender == _tokenLock.owner || isRoleApprovedForAll(_tokenLock.tokenAddress, _tokenLock.owner, msg.sender),
            'ERC7589RolesRegistry: sender is not owner or approved'
        );
        _;
    }

    constructor(address _marketplaceAddress) {
        managerAddress = msg.sender;
        marketplaceAddress = _marketplaceAddress;
        supportedInterfaces[type(IERC7589).interfaceId] = true;
        supportedInterfaces[type(IERC1155Receiver).interfaceId] = true;
        supportedInterfaces[type(IERC7589LockTokensAndGrantRoleExtension).interfaceId] = true;
    }

    /** ERC-7589 External Functions **/

    function lockTokens(
        address _owner,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) external returns (uint256 lockId_) {
        lockId_ = _lockTokens(_owner, _tokenAddress, _tokenId, _tokenAmount);
    }

    function grantRole(
        uint256 _lockId,
        bytes32 _roleId,
        address _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external {
        _grantERC7589Role(_lockId, _roleId, _recipient, _expirationDate, _revocable, _data);
    }

    function revokeRole(
        uint256 _lockId, bytes32 _roleId, address _recipient
    ) external {
        TokenLock storage _tokenLock = tokenLocks[_lockId];
        Role storage _role = roles[_lockId][_roleId];
        require(_role.expirationDate > block.timestamp, 'ERC7589RolesRegistry: role does not exist');

        // ensure caller is approved
        address caller = _findCaller(_tokenLock.owner, _role.recipient, _tokenLock.tokenAddress);
        if (_role.expirationDate > block.timestamp && !_role.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(
                caller == _role.recipient,
                'ERC7589RolesRegistry: role is not revocable or caller is not the approved'
            );
        }

        if (!_role.revocable) {
            tokenLockExpirationDates[_lockId].remove(_role.expirationDate);
        }

        delete roles[_lockId][_roleId];
        emit RoleRevoked(_lockId, _roleId, _recipient);
    }

    function unlockTokens(uint256 _lockId) external onlyTokenLockOwnerOrApproved(_lockId) {
        uint64 _headExpirationDate = tokenLockExpirationDates[_lockId].head;
        require(_headExpirationDate < block.timestamp, 'ERC7589RolesRegistry: NFT is locked');

        address _owner = tokenLocks[_lockId].owner;
        address _tokenAddress = tokenLocks[_lockId].tokenAddress;
        uint256 _tokenId = tokenLocks[_lockId].tokenId;
        uint256 _tokenAmount = tokenLocks[_lockId].tokenAmount;
        delete tokenLocks[_lockId];
        emit TokensUnlocked(_lockId);

        _transferFrom(
            address(this), _owner, _tokenAddress, _tokenId, _tokenAmount
        );
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _approved) external {
        roleApprovals[msg.sender][_tokenAddress][_operator] = _approved;
    }

    /** ERC-7589 Lock Tokens and Grant Role Extension External Functions **/

    function lockTokensAndGrantRole(
        address _owner,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        bytes32 _roleId,
        address _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external returns (uint256 lockId_) {
        lockId_ = _lockTokens(_owner, _tokenAddress, _tokenId, _tokenAmount);
        _grantERC7589Role(lockId_, _roleId, _recipient, _expirationDate, _revocable, _data);
    }

    /** Manager External Functions **/

    function setMarketplaceAddress(address _marketplaceAddress) external onlyManager {
        marketplaceAddress = _marketplaceAddress;
    }

    function setTokenAddressAllowed(address _tokenAddress, bool _isAllowed) external onlyManager {
        isTokenAddressAllowed[_tokenAddress] = _isAllowed;
    }

    function setManagerAddress(address _managerAddress) external onlyManager {
        managerAddress = _managerAddress;
    }

    /** View Functions **/

    function ownerOf(uint256 _lockId) external view returns (address owner_) {
        return tokenLocks[_lockId].owner;
    }

    function tokenAddressOf(uint256 _lockId) external view returns (address tokenAddress_) {
        return tokenLocks[_lockId].tokenAddress;
    }

    function tokenIdOf(uint256 _lockId) external view returns (uint256 tokenId_) {
        return tokenLocks[_lockId].tokenId;
    }

    function tokenAmountOf(uint256 _lockId) external view returns (uint256 tokenAmount_) {
        return tokenLocks[_lockId].tokenAmount;
    }

    function roleData(uint256 _lockId, bytes32 _roleId) external view returns (bytes memory data_) {
        if (roles[_lockId][_roleId].expirationDate > block.timestamp) {
            return roles[_lockId][_roleId].data;
        }
        return '';
    }

    function roleExpirationDate(uint256 _lockId, bytes32 _roleId) external view returns (uint64 expirationDate_) {
        if (roles[_lockId][_roleId].expirationDate > block.timestamp) {
            return roles[_lockId][_roleId].expirationDate;
        }
        return 0;
    }

    function isRoleRevocable(uint256 _lockId, bytes32 _roleId) external view returns (bool revocable_) {
        if (roles[_lockId][_roleId].expirationDate > block.timestamp) {
            return roles[_lockId][_roleId].revocable;
        }
        return false;
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _owner,
        address _operator
    ) public view returns (bool isApproved_) {
        return _operator == marketplaceAddress || roleApprovals[_owner][_tokenAddress][_operator];
    }

    /** ERC-165 View Functions **/

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC1155Receiver) returns (bool) {
        return supportedInterfaces[interfaceId];
    }

    /** Helper Functions **/

    function _lockTokens(
        address _owner,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) private onlyAllowedTokenAddress(_tokenAddress) onlyOwnerOrApproved(_owner, _tokenAddress) returns (uint256 lockId_) {
        require(_tokenAmount > 0, 'ERC7589RolesRegistry: tokenAmount must be greater than zero');
        lockId_ = ++lockIdCount;
        tokenLocks[lockId_] = TokenLock(_owner, _tokenAddress, _tokenId, _tokenAmount);
        emit TokensLocked(_owner, lockId_, _tokenAddress, _tokenId, _tokenAmount);
        _transferFrom(_owner, address(this), _tokenAddress, _tokenId, _tokenAmount);
    }

    function _grantERC7589Role(
        uint256 _lockId,
        bytes32 _roleId,
        address _recipient,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) private onlyTokenLockOwnerOrApproved(_lockId) {
        require(_expirationDate > block.timestamp, 'ERC7589RolesRegistry: expirationDate must be in the future');

        // only grant new role if previous role is expired or revocable
        Role storage _currentRole = roles[_lockId][_roleId];
        require(
            _currentRole.expirationDate < block.timestamp || _currentRole.revocable,
            'ERC7589RolesRegistry: role is not expired nor revocable'
        );

        // if role is not revocable
        if (!_revocable) {
            // add expiration date to lock list
            tokenLockExpirationDates[_lockId].insert(_expirationDate);
        }

        roles[_lockId][_roleId] = Role(_recipient, _expirationDate, _revocable, _data);
        emit RoleGranted(_lockId, _roleId, _recipient, _expirationDate, _revocable, _data);
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
    // if both owner and recipient approve the sender, the recipient should be returned
    // if owner is returned instead, the recipient won't be able to revoke roles
    function _findCaller(address _owner, address _recipient, address _tokenAddress) internal view returns (address) {
        if (_recipient == msg.sender || isRoleApprovedForAll(_tokenAddress, _recipient, msg.sender)) {
            return _recipient;
        }
        if (_owner == msg.sender || isRoleApprovedForAll(_tokenAddress, _owner, msg.sender)) {
            return _owner;
        }
        revert('ERC7589RolesRegistry: sender is not approved');
    }
}
