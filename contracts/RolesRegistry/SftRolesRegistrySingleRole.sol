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

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public roleApprovals;

    // grantor => nonce => DepositInfo
    mapping(address => mapping(uint256 => DepositInfo)) public deposits;

    // grantor => nonce => role => RoleAssignment
    mapping(address => mapping(uint256 => mapping(bytes32 => RoleData))) internal roleAssignments;

    modifier validGrantRoleData(
        uint256 _nonce,
        address _grantee,
        uint64 _expirationDate,
        uint256 _tokenAmount,
        bytes32 _role
    ) {
        require(_nonce > 0, 'SftRolesRegistry: nonce must be greater than zero');
        require(_expirationDate > block.timestamp, 'SftRolesRegistry: expiration date must be in the future');
        require(_tokenAmount > 0, 'SftRolesRegistry: tokenAmount must be greater than zero');
        require(_role == UNIQUE_ROLE, 'SftRolesRegistry: role not supported');
        require(_grantee != address(0), 'SftRolesRegistry: grantee must not be zero address');
        _;
    }

    modifier onlyOwnerOrApproved(address _account, address _tokenAddress) {
        require(
            _account == msg.sender || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'SftRolesRegistry: account not approved'
        );
        _;
    }

    modifier validRoleAndGrantee(
        address _grantor,
        bytes32 _role,
        address _grantee,
        uint256 _nonce
    ) {
        require(_role == UNIQUE_ROLE, 'SftRolesRegistry: role not supported');
        require(
            _grantee != address(0) && _grantee == roleAssignments[_grantor][_nonce][_role].grantee,
            'SftRolesRegistry: grantee mismatch'
        );
        _;
    }

    /** External Functions **/

    function grantRoleFrom(
        RoleAssignment calldata _grantRoleData
    )
        external
        override
        validGrantRoleData(
            _grantRoleData.nonce,
            _grantRoleData.grantee,
            _grantRoleData.expirationDate,
            _grantRoleData.tokenAmount,
            _grantRoleData.role
        )
        onlyOwnerOrApproved(_grantRoleData.grantor, _grantRoleData.tokenAddress)
    {
        if (deposits[_grantRoleData.grantor][_grantRoleData.nonce].tokenAmount == 0) {
            // nonce does not exist, transfer tokens
            _deposit(_grantRoleData);
        } else {
            // nonce exists
            require(
                deposits[_grantRoleData.grantor][_grantRoleData.nonce].tokenAddress == _grantRoleData.tokenAddress,
                'SftRolesRegistry: tokenAddress mismatch'
            );
            require(
                deposits[_grantRoleData.grantor][_grantRoleData.nonce].tokenId == _grantRoleData.tokenId,
                'SftRolesRegistry: tokenId mismatch'
            );
            require(
                deposits[_grantRoleData.grantor][_grantRoleData.nonce].tokenAmount == _grantRoleData.tokenAmount,
                'SftRolesRegistry: tokenAmount mismatch'
            );

            RoleData storage _roleData = roleAssignments[_grantRoleData.grantor][_grantRoleData.nonce][
                _grantRoleData.role
            ];
            require(
                _roleData.expirationDate < block.timestamp || _roleData.revocable,
                'SftRolesRegistry: nonce is not expired or is not revocable'
            );
        }
        _grantOrUpdateRole(_grantRoleData);
    }

    function revokeRoleFrom(
        address _grantor,
        uint256 _nonce,
        bytes32 _role,
        address _grantee
    ) external override {
        RoleData memory _roleData = roleAssignments[_grantor][_nonce][_role];
        require(_roleData.expirationDate != 0, 'SftRolesRegistry: role does not exist');
        require(_grantee == _roleData.grantee, 'SftRolesRegistry: grantee mismatch');

        DepositInfo storage _depositInfo = deposits[_grantor][_nonce];
        address caller = _findCaller(_grantor, _roleData.grantee, _depositInfo.tokenAddress);
        if (_roleData.expirationDate > block.timestamp && !_roleData.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _roleData.grantee, 'SftRolesRegistry: nonce is not expired or is not revocable');
        }

        delete roleAssignments[_grantor][_nonce][_role];

        emit RoleRevoked(
            _grantor,
            _nonce,
            UNIQUE_ROLE,
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount,
            _roleData.grantee
        );
    }

    function withdrawFrom(
        address _grantor,
        uint256 _nonce
    ) public onlyOwnerOrApproved(_grantor, deposits[_grantor][_nonce].tokenAddress) {
        require(deposits[_grantor][_nonce].tokenAmount != 0, 'SftRolesRegistry: nonce does not exist');
        require(
            roleAssignments[_grantor][_nonce][UNIQUE_ROLE].expirationDate < block.timestamp ||
                roleAssignments[_grantor][_nonce][UNIQUE_ROLE].revocable,
            'SftRolesRegistry: token has an active role'
        );

        delete roleAssignments[_grantor][_nonce][UNIQUE_ROLE];

        _transferFrom(
            address(this),
            _grantor,
            deposits[_grantor][_nonce].tokenAddress,
            deposits[_grantor][_nonce].tokenId,
            deposits[_grantor][_nonce].tokenAmount
        );

        delete deposits[_grantor][_nonce];
        emit Withdrew(_grantor, _nonce);
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        roleApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function roleData(
        address _grantor,
        uint256 _nonce,
        bytes32 _role,
        address _grantee
    ) external view validRoleAndGrantee(_grantor, _role, _grantee, _nonce) returns (RoleData memory) {
        return roleAssignments[_grantor][_nonce][_role];
    }

    function roleExpirationDate(
        address _grantor,
        uint256 _nonce,
        bytes32 _role,
        address _grantee
    ) external view validRoleAndGrantee(_grantor, _role, _grantee, _nonce) returns (uint64 expirationDate_) {
        return roleAssignments[_grantor][_nonce][_role].expirationDate;
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

    function _deposit(RoleAssignment calldata _grantRoleData) internal {
        deposits[_grantRoleData.grantor][_grantRoleData.nonce] = DepositInfo(
            _grantRoleData.tokenAddress,
            _grantRoleData.tokenId,
            _grantRoleData.tokenAmount
        );

        _transferFrom(
            _grantRoleData.grantor,
            address(this),
            _grantRoleData.tokenAddress,
            _grantRoleData.tokenId,
            _grantRoleData.tokenAmount
        );
    }

    function _grantOrUpdateRole(RoleAssignment calldata _grantRoleData) internal {
        roleAssignments[_grantRoleData.grantor][_grantRoleData.nonce][_grantRoleData.role] = RoleData(
            _grantRoleData.grantee,
            _grantRoleData.expirationDate,
            _grantRoleData.revocable,
            _grantRoleData.data
        );

        emit RoleGranted(
            _grantRoleData.grantor,
            _grantRoleData.nonce,
            UNIQUE_ROLE,
            _grantRoleData.tokenAddress,
            _grantRoleData.tokenId,
            _grantRoleData.tokenAmount,
            _grantRoleData.grantee,
            _grantRoleData.expirationDate,
            _grantRoleData.revocable,
            _grantRoleData.data
        );
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
