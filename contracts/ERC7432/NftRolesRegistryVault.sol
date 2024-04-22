// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from '../interfaces/IERC7432.sol';
import { IERC7432VaultExtension } from '../interfaces/IERC7432VaultExtension.sol';
import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

contract NftRolesRegistryVault is IERC7432, IERC7432VaultExtension {
    struct RoleData {
        address recipient;
        uint64 expirationDate;
        bool revocable;
        bytes data;
    }

    // tokenAddress => tokenId => owner
    mapping(address => mapping(uint256 => address)) public originalOwners;

    // tokenAddress => tokenId => roleId => struct(recipient, expirationDate, revocable, data)
    mapping(address => mapping(uint256 => mapping(bytes32 => RoleData))) public roles;

    // owner => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    /** ERC-7432 External Functions **/

    function grantRole(IERC7432.Role calldata _role) external override {
        require(_role.expirationDate > block.timestamp, 'NftRolesRegistryVault: expiration date must be in the future');

        // deposit NFT if necessary
        // reverts if sender is not approved or original owner
        address _originalOwner = _depositNft(_role.tokenAddress, _role.tokenId);

        // role must be expired or revocable
        RoleData storage _roleData = roles[_role.tokenAddress][_role.tokenId][_role.roleId];
        require(
            _roleData.revocable || _roleData.expirationDate < block.timestamp,
            'NftRolesRegistryVault: role must be expired or revocable'
        );

        roles[_role.tokenAddress][_role.tokenId][_role.roleId] = RoleData(
            _role.recipient,
            _role.expirationDate,
            _role.revocable,
            _role.data
        );

        emit RoleGranted(
            _role.tokenAddress,
            _role.tokenId,
            _role.roleId,
            _originalOwner,
            _role.recipient,
            _role.expirationDate,
            _role.revocable,
            _role.data
        );
    }

    function revokeRole(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external override {
        address _recipient = roles[_tokenAddress][_tokenId][_roleId].recipient;
        address _caller = _getApprovedCaller(_tokenAddress, _tokenId, _recipient);

        // if caller is recipient, the role can be revoked regardless of its state
        if (_caller != _recipient) {
            // if caller is owner, the role can only be revoked if revocable or expired
            require(
                roles[_tokenAddress][_tokenId][_roleId].revocable ||
                    roles[_tokenAddress][_tokenId][_roleId].expirationDate < block.timestamp,
                'NftRolesRegistryVault: role is not revocable nor expired'
            );
        }

        delete roles[_tokenAddress][_tokenId][_roleId];
        emit RoleRevoked(_tokenAddress, _tokenId, _roleId);
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _approved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _approved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _approved);
    }

    /** ERC-7432 View Functions **/

    function recipientOf(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (address recipient_) {
        if (
            _isTokenDeposited(_tokenAddress, _tokenId) &&
            roles[_tokenAddress][_tokenId][_roleId].expirationDate > block.timestamp
        ) {
            return roles[_tokenAddress][_tokenId][_roleId].recipient;
        }
        return address(0);
    }

    function roleData(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (bytes memory data_) {
        if (!_isTokenDeposited(_tokenAddress, _tokenId)) {
            return '';
        }
        return roles[_tokenAddress][_tokenId][_roleId].data;
    }

    function roleExpirationDate(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (uint64 expirationDate_) {
        if (!_isTokenDeposited(_tokenAddress, _tokenId)) {
            return 0;
        }
        return roles[_tokenAddress][_tokenId][_roleId].expirationDate;
    }

    function isRoleRevocable(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (bool revocable_) {
        if (!_isTokenDeposited(_tokenAddress, _tokenId)) {
            return false;
        }
        return roles[_tokenAddress][_tokenId][_roleId].revocable;
    }

    function isRoleApprovedForAll(address _tokenAddress, address _owner, address _operator) public view returns (bool) {
        return tokenApprovals[_owner][_tokenAddress][_operator];
    }

    /** ERC-7432 Vault Extension Functions **/

    function withdraw(address _tokenAddress, uint256 _tokenId) external override {
        address originalOwner = originalOwners[_tokenAddress][_tokenId];

        require(_isWithdrawable(_tokenAddress, _tokenId), 'NftRolesRegistryVault: NFT is not withdrawable');

        require(
            originalOwner == msg.sender || isRoleApprovedForAll(_tokenAddress, originalOwner, msg.sender),
            'NftRolesRegistryVault: sender must be owner or approved'
        );

        delete originalOwners[_tokenAddress][_tokenId];
        IERC721(_tokenAddress).transferFrom(address(this), originalOwner, _tokenId);
        emit Withdraw(originalOwner, _tokenAddress, _tokenId);
    }

    function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address owner_) {
        return originalOwners[_tokenAddress][_tokenId];
    }

    /** ERC-165 Functions **/

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC7432).interfaceId || interfaceId == type(IERC7432VaultExtension).interfaceId;
    }

    /** Internal Functions **/

    /// @notice Updates originalOwner, validates the sender and deposits NFT (if not deposited yet).
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @return originalOwner_ The original owner of the NFT.
    function _depositNft(address _tokenAddress, uint256 _tokenId) internal returns (address originalOwner_) {
        address _currentOwner = IERC721(_tokenAddress).ownerOf(_tokenId);

        if (_currentOwner == address(this)) {
            // if the NFT is already on the contract, check if sender is approved or original owner
            originalOwner_ = originalOwners[_tokenAddress][_tokenId];
            require(
                originalOwner_ == msg.sender || isRoleApprovedForAll(_tokenAddress, originalOwner_, msg.sender),
                'NftRolesRegistryVault: sender must be owner or approved'
            );
        } else {
            // if NFT is not in the contract, deposit it and store the original owner
            require(
                _currentOwner == msg.sender || isRoleApprovedForAll(_tokenAddress, _currentOwner, msg.sender),
                'NftRolesRegistryVault: sender must be owner or approved'
            );
            IERC721(_tokenAddress).transferFrom(_currentOwner, address(this), _tokenId);
            originalOwners[_tokenAddress][_tokenId] = _currentOwner;
            originalOwner_ = _currentOwner;
        }
    }

    /// @notice Returns the account approved to call the revokeRole function. Reverts otherwise.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _recipient The user that received the role.
    /// @return caller_ The approved account.
    function _getApprovedCaller(
        address _tokenAddress,
        uint256 _tokenId,
        address _recipient
    ) internal view returns (address caller_) {
        if (msg.sender == _recipient || isRoleApprovedForAll(_tokenAddress, _recipient, msg.sender)) {
            return _recipient;
        }
        address originalOwner = originalOwners[_tokenAddress][_tokenId];
        if (msg.sender == originalOwner || isRoleApprovedForAll(_tokenAddress, originalOwner, msg.sender)) {
            return originalOwner;
        }
        revert('NftRolesRegistryVault: role does not exist or sender is not approved');
    }

    /// @notice Check if an NFT is withdrawable.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @return True if the NFT is withdrawable.
    function _isWithdrawable(address _tokenAddress, uint256 _tokenId) internal view returns (bool) {
        // todo needs to implement a way to track expiration dates to make sure NFTs are withdrawable
        // mocked result
        return _isTokenDeposited(_tokenAddress, _tokenId);
    }

    /// @notice Checks if the NFT is deposited on this contract.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @return deposited_ Whether the NFT is deposited or not.
    function _isTokenDeposited(address _tokenAddress, uint256 _tokenId) internal view returns (bool) {
        return originalOwners[_tokenAddress][_tokenId] != address(0);
    }
}
