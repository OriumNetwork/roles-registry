// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract RolesRegistry is IERC7432 {
    // grantee => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData)))) public roleAssignments;

    // tokenAddress => tokenId => role => grantee
    mapping(address => mapping(uint256 => mapping(bytes32 => address))) public latestGrantees;

    // grantor => tokenAddress => tokenId => operator => isApproved
    mapping(address => mapping(address => mapping(uint256 => mapping(address => bool)))) public tokenIdApprovals;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    modifier onlyOwnerOrApproved(
        address _tokenAddress,
        uint256 _tokenId,
        address _account,
        uint256 _amount
    ) {
        require(
            _isOwner(_tokenAddress, _tokenId, _amount, msg.sender) ||
            _isRoleApproved(_tokenAddress, _tokenId, _account, msg.sender),
            "RolesRegistry: sender must be token owner or approved"
        );
        _;
    }

    modifier isTokenOwner(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _account
    ) {
        require(_isOwner(_tokenAddress, _tokenId, _amount, _account), "RolesRegistry: account must be token owner");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external isTokenOwner(_tokenAddress, _tokenId, _amount, msg.sender) {
        _grantRole(_role, _tokenAddress, _tokenId, _amount, msg.sender, _grantee, _expirationDate, _revocable, _data);
    }

    function grantRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    )
        external
        isTokenOwner(_tokenAddress, _tokenId, _amount, _grantor)
        onlyOwnerOrApproved(_tokenAddress, _tokenId, _grantor, _amount)
    {
        _grantRole(_role, _tokenAddress, _tokenId, _amount, _grantor, _grantee, _expirationDate, _revocable, _data);
    }

    function _grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal validExpirationDate(_expirationDate) {
        address _lastGrantee = latestGrantees[_tokenAddress][_tokenId][_role];
        RoleData memory _roleData = roleAssignments[_lastGrantee][_tokenAddress][_tokenId][_role];

        bool _hasActiveAssignment = _roleData.expirationDate > block.timestamp;

        if (_hasActiveAssignment) {
            // only unique roles can be revocable
            require(_roleData.revocable, "RolesRegistry: role is not revocable");
        }

        roleAssignments[_grantee][_tokenAddress][_tokenId][_role] = RoleData(_amount, _expirationDate, _revocable, _data);
        latestGrantees[_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_role, _tokenAddress, _tokenId, _amount, _grantor, _grantee, _expirationDate, _revocable, _data);
    }

    function revokeRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantee
    ) external isTokenOwner(_tokenAddress, _tokenId, _amount, msg.sender) {
        _revokeRole(_role, _tokenAddress, _tokenId, msg.sender, _grantee, msg.sender);
    }

    function revokeRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _revoker,
        address _grantee
    ) external override isTokenOwner(_tokenAddress, _tokenId, _amount, _revoker) {
        address _caller = _isOwner(_tokenAddress, _tokenId, _amount, msg.sender) ? _revoker : _getApprovedCaller(_tokenAddress, _tokenId, _revoker, _grantee);
        _revokeRole(_role, _tokenAddress, _tokenId, _revoker, _grantee, _caller);
    }

    function _getApprovedCaller(
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee
    ) internal view returns (address) {
        if (_isRoleApproved(_tokenAddress, _tokenId, _grantee, msg.sender)) {
            return _grantee;
        } else if (_isRoleApproved(_tokenAddress, _tokenId, _revoker, msg.sender)) {
            return _revoker;
        } else {
            revert("RolesRegistry: sender must be approved");
        }
    }

    function _revokeRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee,
        address _caller
    ) internal {
        RoleData memory _roleData = roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        require(
            _caller == _grantee || _roleData.revocable,
            "RolesRegistry: Role is not revocable or caller is not the grantee"
        );
        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        delete latestGrantees[_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _tokenAddress, _tokenId, _roleData.amount, _revoker, _grantee);
    }

    function hasRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bool) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp &&
            _amount <= roleAssignments[_grantee][_tokenAddress][_tokenId][_role].amount;
    }

    function hasUniqueRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bool) {
        return
            latestGrantees[_tokenAddress][_tokenId][_role] == _grantee &&
            roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp &&
            _amount <= roleAssignments[_grantee][_tokenAddress][_tokenId][_role].amount;
    }

    function roleData(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bytes memory data_) {
        RoleData memory _roleData = roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.data);
    }

    function roleExpirationDate(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (uint64 expirationDate_) {
        RoleData memory _roleData = roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.expirationDate);
    }

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC7432).interfaceId;
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    function approveRole(address _tokenAddress, uint256 _tokenId, address _operator, bool _approved) external override {
        tokenIdApprovals[msg.sender][_tokenAddress][_tokenId][_operator] = _approved;
        emit RoleApproval(_tokenAddress, _tokenId, _operator, _approved);
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
    }

    function getApprovedRole(
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenIdApprovals[_grantor][_tokenAddress][_tokenId][_operator];
    }

    function _isRoleApproved(
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _operator
    ) internal view returns (bool) {
        return
            isRoleApprovedForAll(_tokenAddress, _grantor, _operator) ||
            getApprovedRole(_tokenAddress, _tokenId, _grantor, _operator);
    }

    function _isOwner(address _tokenAddress, uint256 _tokenId, uint256 _amount, address _account) internal view returns (bool) {
        if (_amount > 0) return IERC1155(_tokenAddress).balanceOf(_account, _tokenId) >= _amount;
        else return _account == IERC721(_tokenAddress).ownerOf(_tokenId); // Assuming that the token implements ERC721
    }
}
