// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC721Receiver } from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import { ERC721Holder } from '@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol';
import { IERC7432 } from '../interfaces/IERC7432.sol';
import { IERC4907 } from '../interfaces/IERC4907.sol';
import { IERC7432VaultExtension } from '../interfaces/IERC7432VaultExtension.sol';
import { IOriumWrapperManager } from '../interfaces/IOriumWrapperManager.sol';
import { IWrapNFT } from '../interfaces/DoubleProtocol/IWrapNFT.sol';

/// @title ERC-7432 Wrapper for ERC-4907
/// @dev This contract introduces a ERC-7432 interface to manage the role of ERC-4907 NFTs.
contract ERC7432WrapperForERC4907 is IERC7432, IERC7432VaultExtension, ERC721Holder {
    bytes32 public constant USER_ROLE = keccak256('User()');

    address public oriumWrapperManager;

    // tokenAddress => tokenId => owner
    mapping(address => mapping(uint256 => address)) public originalOwners;

    // tokenAddress => tokenId => revocable
    mapping(address => mapping(uint256 => bool)) public isRevocableRole;

    // owner => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    /** ######### Modifiers ########### **/

    modifier onlyUserRole(bytes32 _roleId) {
        require(_roleId == USER_ROLE, "ERC7432WrapperForERC4907: only 'User()' role is allowed");
        _;
    }

    /** ERC-7432 External Functions **/

    constructor(address _oriumWrapperManagerAddress) {
        oriumWrapperManager = _oriumWrapperManagerAddress;
    }

    function grantRole(Role calldata _role) external override onlyUserRole(_role.roleId) {
        address _wrappedTokenAddress = IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_role.tokenAddress);
        require(_wrappedTokenAddress != address(0), 'ERC7432WrapperForERC4907: token not supported');

        require(
            _role.expirationDate > block.timestamp &&
                _role.expirationDate <
                block.timestamp + IOriumWrapperManager(oriumWrapperManager).getMaxDurationOf(_role.tokenAddress),
            'ERC7432WrapperForERC4907: invalid expiration date'
        );

        // deposit NFT if necessary
        // reverts if sender is not approved or original owner
        address _originalOwner = _depositNft(_role.tokenAddress, _role.tokenId, _wrappedTokenAddress);

        // role must be expired or revocable
        require(
            isRevocableRole[_role.tokenAddress][_role.tokenId] ||
                IERC4907(_wrappedTokenAddress).userExpires(_role.tokenId) < block.timestamp,
            'ERC7432WrapperForERC4907: role must be expired or revocable'
        );

        IERC4907(_wrappedTokenAddress).setUser(_role.tokenId, _role.recipient, _role.expirationDate);
        isRevocableRole[_role.tokenAddress][_role.tokenId] = _role.revocable;
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

    function revokeRole(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external override onlyUserRole(_roleId) {
        address _wrappedTokenAddress = IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_tokenAddress);
        require(_wrappedTokenAddress != address(0), 'ERC7432WrapperForERC4907: token not supported');

        address _recipient = IERC4907(_wrappedTokenAddress).userOf(_tokenId);
        address _caller = _getApprovedCaller(_tokenAddress, _tokenId, _recipient);

        // if caller is recipient, the role can be revoked regardless of its state
        if (_caller != _recipient) {
            // if caller is owner, the role can only be revoked if revocable or expired
            require(
                isRevocableRole[_tokenAddress][_tokenId] ||
                    IERC4907(_wrappedTokenAddress).userExpires(_tokenId) < block.timestamp,
                'ERC7432WrapperForERC4907: role is not revocable nor expired'
            );
        }

        delete isRevocableRole[_tokenAddress][_tokenId];
        IERC4907(_wrappedTokenAddress).setUser(_tokenId, address(0), uint64(0));
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
        address _wrappedTokenAddress = IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_tokenAddress);
        if (_wrappedTokenAddress == address(0) || _roleId != USER_ROLE) {
            return address(0);
        }
        return IERC4907(_wrappedTokenAddress).userOf(_tokenId);
    }

    function roleData(address, uint256, bytes32) external pure returns (bytes memory) {
        return '';
    }

    function roleExpirationDate(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (uint64 expirationDate_) {
        address _wrappedTokenAddress = IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_tokenAddress);
        if (_wrappedTokenAddress == address(0) || _roleId != USER_ROLE) {
            return 0;
        }
        return uint64(IERC4907(_wrappedTokenAddress).userExpires(_tokenId));
    }

    function isRoleRevocable(
        address _tokenAddress,
        uint256 _tokenId,
        bytes32 _roleId
    ) external view returns (bool revocable_) {
        return
            _roleId == USER_ROLE &&
            isRevocableRole[_tokenAddress][_tokenId] &&
            IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_tokenAddress) != address(0);
    }

    function isRoleApprovedForAll(address _tokenAddress, address _owner, address _operator) public view returns (bool) {
        return
            _operator == IOriumWrapperManager(oriumWrapperManager).getMarketplaceAddressOf(_tokenAddress) ||
            tokenApprovals[_owner][_tokenAddress][_operator];
    }

    /** ERC-7432 Vault Extension Functions **/

    function withdraw(address _tokenAddress, uint256 _tokenId) external override {
        address _wrappedTokenAddress = IOriumWrapperManager(oriumWrapperManager).getWrappedTokenOf(_tokenAddress);
        require(_wrappedTokenAddress != address(0), 'ERC7432WrapperForERC4907: token not supported');

        address originalOwner = originalOwners[_tokenAddress][_tokenId];
        require(
            originalOwner == msg.sender || isRoleApprovedForAll(_tokenAddress, originalOwner, msg.sender),
            'ERC7432WrapperForERC4907: sender must be owner or approved'
        );

        require(
            isRevocableRole[_tokenAddress][_tokenId] ||
                IERC4907(_wrappedTokenAddress).userExpires(_tokenId) < block.timestamp,
            'ERC7432WrapperForERC4907: token is not withdrawable'
        );

        delete originalOwners[_tokenAddress][_tokenId];
        delete isRevocableRole[_tokenAddress][_tokenId];
        IWrapNFT(_wrappedTokenAddress).redeem(_tokenId);
        IERC721(_tokenAddress).transferFrom(address(this), originalOwner, _tokenId);
        emit Withdraw(originalOwner, _tokenAddress, _tokenId);
    }

    function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address owner_) {
        return originalOwners[_tokenAddress][_tokenId];
    }

    /** ERC-165 Functions **/

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return
            interfaceId == type(IERC7432).interfaceId ||
            interfaceId == type(IERC7432VaultExtension).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId;
    }

    /** Internal Functions **/

    /// @notice Updates originalOwner, validates the sender and deposits NFT (if not deposited yet).
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _wrappedTokenAddress The wrapped token address.
    /// @return originalOwner_ The original owner of the NFT.
    function _depositNft(
        address _tokenAddress,
        uint256 _tokenId,
        address _wrappedTokenAddress
    ) internal returns (address originalOwner_) {
        address _ownerOfOriginalToken = IERC721(_tokenAddress).ownerOf(_tokenId);
        if (_ownerOfOriginalToken == _wrappedTokenAddress) {
            // if NFT is in the wrapper contract, this contract should be the NFT owner
            require(
                IERC721(_wrappedTokenAddress).ownerOf(_tokenId) == address(this),
                'ERC7432WrapperForERC4907: contract does not own wrapped token'
            );

            originalOwner_ = originalOwners[_tokenAddress][_tokenId];
            require(
                originalOwner_ == msg.sender || isRoleApprovedForAll(_tokenAddress, originalOwner_, msg.sender),
                'ERC7432WrapperForERC4907: sender must be owner or approved'
            );
        } else {
            // if NFT is not in the wrapper contract, wrap it and store the original owner
            require(
                _ownerOfOriginalToken == msg.sender ||
                    isRoleApprovedForAll(_tokenAddress, _ownerOfOriginalToken, msg.sender),
                'ERC7432WrapperForERC4907: sender must be owner or approved'
            );
            IERC721(_tokenAddress).transferFrom(_ownerOfOriginalToken, address(this), _tokenId);
            IERC721(_tokenAddress).approve(_wrappedTokenAddress, _tokenId);
            IWrapNFT(_wrappedTokenAddress).stake(_tokenId);
            originalOwners[_tokenAddress][_tokenId] = _ownerOfOriginalToken;
            originalOwner_ = _ownerOfOriginalToken;
            emit TokensCommitted(_ownerOfOriginalToken, _tokenAddress, _tokenId);
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
        revert('ERC7432WrapperForERC4907: sender is not recipient, owner or approved');
    }
}
