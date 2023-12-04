// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from './interfaces/IERCXXXX.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { IERC1155 } from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import { IERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import { ERC1155Holder, ERC1155Receiver } from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

// Semi-fungible token (SFT) registry with only one role (UNIQUE_ROLE)
contract SftRegistry is IERCXXXX, ERC1155Holder {
    bytes32 public constant UNIQUE_ROLE = keccak256('UNIQUE_ROLE');

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    // nonce => DepositInfo
    mapping(uint256 => DepositInfo) public deposits;

    // nonce  => RoleAssignment
    mapping(uint256 => RoleData) internal roleAssignments;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, 'SftRegistry: expiration date must be in the future');
        _;
    }

    modifier onlyOwnerOrApprovedWithBalance(
        address _account,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount
    ) {
        require(_tokenAmount > 0, 'SftRegistry: tokenAmount must be greater than zero');
        require(
            _account == msg.sender || isRoleApprovedForAll(_tokenAddress, _account, msg.sender),
            'SftRegistry: account not approved'
        );
        _;
    }

    /** External Functions **/

    function grantRoleFrom(
        RoleAssignment calldata _grantRoleData
    )
        external
        override
        validExpirationDate(_grantRoleData.expirationDate)
        onlyOwnerOrApprovedWithBalance(
            _grantRoleData.grantor,
            _grantRoleData.tokenAddress,
            _grantRoleData.tokenId,
            _grantRoleData.tokenAmount
        )
    {
        require(_grantRoleData.nonce > 0, 'SftRegistry: nonce must be greater than zero');
        DepositInfo memory _depositInfo = deposits[_grantRoleData.nonce];

        if (_depositInfo.grantor == address(0)) {
            _depositInfo = DepositInfo(
                _grantRoleData.grantor,
                _grantRoleData.tokenAddress,
                _grantRoleData.tokenId,
                _grantRoleData.tokenAmount
            );
            _deposit(_grantRoleData.nonce, _depositInfo);
        }
        RoleData memory _roleData = RoleData(
            _grantRoleData.role,
            _grantRoleData.grantee,
            _grantRoleData.expirationDate,
            _grantRoleData.revocable,
            _grantRoleData.data
        );
        _grantOrUpdateRole(_grantRoleData.nonce, _depositInfo, _roleData);
    }

    function _grantOrUpdateRole(uint256 _nonce, DepositInfo memory _depositInfo, RoleData memory _roleData) internal {
        // validate if previous role assignment is expired or revocable
        RoleData memory _previousRoleData = roleAssignments[_nonce];
        require(
            _previousRoleData.expirationDate < block.timestamp || _previousRoleData.revocable,
            'SftRegistry: nonce is not expired or is not revocable'
        );

        roleAssignments[_nonce] = _roleData;

        emit RoleGranted(
            _nonce,
            UNIQUE_ROLE,
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount,
            _depositInfo.grantor,
            _roleData.grantee,
            _roleData.expirationDate,
            _roleData.revocable,
            _roleData.data
        );
    }

    function _deposit(uint256 _nonce, DepositInfo memory _depositInfo) internal {
        deposits[_nonce] = _depositInfo;

        emit Deposited(
            _nonce,
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount,
            _depositInfo.grantor
        );

        _transferFrom(
            _depositInfo.grantor,
            address(this),
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount
        );
    }

    function revokeRoleFrom(uint256 _nonce, bytes32 _role) external override {
        // revoke(depositId, role1)
        RoleData memory _roleData = roleAssignments[_nonce];
        require(_roleData.grantee != address(0), 'SftRegistry: invalid grantee');
        DepositInfo memory _depositInfo = deposits[_nonce];

        address caller = _findCaller(_roleData, _depositInfo);
        if (_roleData.expirationDate > block.timestamp && !_roleData.revocable) {
            // if role is not expired and is not revocable, only the grantee can revoke it
            require(caller == _roleData.grantee, 'SftRegistry: nonce is not expired or is not revocable');
        }

        delete roleAssignments[_nonce];

        emit RoleRevoked(
            _nonce,
            UNIQUE_ROLE,
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount,
            _depositInfo.grantor,
            _roleData.grantee
        );
    }

    function withdraw(
        uint256 _nonce
    )
        public
        onlyOwnerOrApprovedWithBalance(
            deposits[_nonce].grantor,
            deposits[_nonce].tokenAddress,
            deposits[_nonce].tokenId,
            deposits[_nonce].tokenAmount
        )
    {
        DepositInfo memory _depositInfo = deposits[_nonce];
        require(
            roleAssignments[_nonce].grantee == address(0) ||
                roleAssignments[_nonce].expirationDate < block.timestamp ||
                roleAssignments[_nonce].revocable,
            'SftRegistry: token has an active role'
        );

        delete deposits[_nonce];
        delete roleAssignments[_nonce];

        _transferFrom(
            address(this),
            _depositInfo.grantor,
            _depositInfo.tokenAddress,
            _depositInfo.tokenId,
            _depositInfo.tokenAmount
        );

        emit Withdrew(
            _nonce,
            _depositInfo.grantor,
            _depositInfo.tokenId,
            _depositInfo.tokenAddress,
            _depositInfo.tokenAmount
        );
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function roleData(uint256 _nonce, bytes32 _role) external view returns (RoleData memory) {
        return roleAssignments[_nonce];
    }

    function roleExpirationDate(uint256 _nonce, bytes32 _role) external view returns (uint64 expirationDate_) {
        return roleAssignments[_nonce].expirationDate;
    }

    function depositInfoOf(uint256 _nonce) external view returns (DepositInfo memory) {
        return deposits[_nonce];
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
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

    function _findCaller(RoleData memory _roleData, DepositInfo memory _depositInfo) internal view returns (address) {
        if (
            _depositInfo.grantor == msg.sender ||
            isRoleApprovedForAll(_depositInfo.tokenAddress, _depositInfo.grantor, msg.sender)
        ) {
            return _depositInfo.grantor;
        }

        if (
            _roleData.grantee == msg.sender ||
            isRoleApprovedForAll(_depositInfo.tokenAddress, _roleData.grantee, msg.sender)
        ) {
            return _roleData.grantee;
        }

        revert('SftRegistry: sender must be approved');
    }
}
