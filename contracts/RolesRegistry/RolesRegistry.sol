// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

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

    modifier onlyApproved(
        address _tokenAddress,
        uint256 _tokenId,
        address _account
    ) {
        require(
            _isRoleApproved(_tokenAddress, _tokenId, _account, msg.sender),
            "RolesRegistry: sender must be approved"
        );
        _;
    }

    modifier onlyTokenOwner(address _tokenAddress, uint256 _tokenId, address _account) {
        require(_isOwner(_tokenAddress, _tokenId, _account), "RolesRegistry: account must be token owner");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external onlyTokenOwner(_tokenAddress, _tokenId, msg.sender) {
        _grantRole(_role, _tokenAddress, _tokenId, msg.sender, _grantee, _expirationDate, _revocable, _data);
    }

    function grantRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) external override  onlyTokenOwner(_tokenAddress, _tokenId, _grantor) onlyApproved(_tokenAddress, _tokenId, _grantor) {
        _grantRole(_role, _tokenAddress, _tokenId, _grantor, _grantee, _expirationDate, _revocable, _data);
    }

    function _grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes calldata _data
    ) internal validExpirationDate(_expirationDate) {
        address _lastGrantee = latestGrantees[_tokenAddress][_tokenId][_role];
        RoleData memory _roleData = roleAssignments[_lastGrantee][_tokenAddress][_tokenId][_role];

        bool _hasActiveAssignment = _roleData.expirationDate > block.timestamp;

        if(_hasActiveAssignment) {
            require(_roleData.revocable, "RolesRegistry: role is not revocable"); // means thats only revocable roles can be multiple assigned
        }

        roleAssignments[_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _revocable, _data);
        latestGrantees[_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_role, _tokenAddress, _tokenId, _grantor, _grantee, _expirationDate, _revocable, _data);
    }

    function revokeRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee
    ) external onlyTokenOwner(_tokenAddress, _tokenId, msg.sender) {
        _revokeRole(_role, _tokenAddress, _tokenId, msg.sender, _grantee, msg.sender);
    }

    function revokeRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee
    ) external override onlyTokenOwner(_tokenAddress, _tokenId, _revoker) {
        address _caller = _getApprovedCaller(_tokenAddress, _tokenId, _revoker, _grantee);
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
        bool _isRevocable = roleAssignments[_grantee][_tokenAddress][_tokenId][_role].revocable;
        require(
            _isRevocable || _caller == _grantee,
            "RolesRegistry: Role is not revocable or caller is not the grantee"
        );
        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        delete latestGrantees[_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _tokenAddress, _tokenId, _revoker, _grantee);
    }

    function hasRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bool) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
    }

    function hasUniqueRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bool) {
        return
            latestGrantees[_tokenAddress][_tokenId][_role] == _grantee &&
            roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
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

    function _isERC1155(address _tokenAddress) internal view returns (bool) {
        return ERC165Checker.supportsInterface(_tokenAddress, type(IERC1155).interfaceId);
    }

    function _isERC721(address _tokenAddress) internal view returns (bool) {
        return ERC165Checker.supportsInterface(_tokenAddress, type(IERC721).interfaceId);
    }

    function _isOwner(address _tokenAddress, uint256 _tokenId, address _account) internal view returns (bool) {
        if (_isERC1155(_tokenAddress)) {
            return IERC1155(_tokenAddress).balanceOf(_account, _tokenId) > 0;
        } else if (_isERC721(_tokenAddress)) {
            return _account == IERC721(_tokenAddress).ownerOf(_tokenId);
        } else {
            revert("RolesRegistry: token address is not ERC1155 or ERC721");
        }
    }
}
