// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";

contract ERC7432 is IERC7432 {
    // grantor => grantee => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData)))))
        public roleAssignments;

    // grantor => tokenAddress => tokenId => role => grantee
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => address)))) public latestGrantees;

    // grantor => tokenAddress => tokenId => operator => isApproved
    mapping(address => mapping(address => mapping(uint256 => mapping(address => bool)))) public tokenIdApprovals;

    // grantor => operator => tokenAddress => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "ERC7432: expiration date must be in the future");
        _;
    }

    modifier onlyApproved(
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor
    ) {
        require(
            isRoleApprovedForAll(_tokenAddress, _grantor, msg.sender) ||
                getApprovedRole(_tokenAddress, _tokenId, _grantor, msg.sender),
            "ERC7432: sender must be approved"
        );
        _;
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) external {
        _grantRole(_role, _tokenAddress, _tokenId, msg.sender, _grantee, _expirationDate, _data);
    }

    function grantRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) external override onlyApproved(_tokenAddress, _tokenId, _grantor) {
        _grantRole(_role, _tokenAddress, _tokenId, _grantor, _grantee, _expirationDate, _data);
    }

    function _grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) internal validExpirationDate(_expirationDate) {
        roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        latestGrantees[_grantor][_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_role, _tokenAddress, _tokenId, _grantor, _grantee, _expirationDate, _data);
    }

    function revokeRole(bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantee) external {
        _revokeRole(_role, _tokenAddress, _tokenId, msg.sender, _grantee);
    }

    function revokeRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee
    ) external override onlyApproved(_tokenAddress, _tokenId, _revoker) {
        _revokeRole(_role, _tokenAddress, _tokenId, _revoker, _grantee);
    }

    function _revokeRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee
    ) internal {
        delete roleAssignments[_revoker][_grantee][_tokenAddress][_tokenId][_role];
        delete latestGrantees[_revoker][_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _tokenAddress, _tokenId, _revoker, _grantee);
    }

    function hasRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bool) {
        return roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
    }

    function hasUniqueRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bool) {
        return
            latestGrantees[_grantor][_tokenAddress][_tokenId][_role] == _grantee &&
            roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
    }

    function roleData(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bytes memory data_) {
        RoleData memory _roleData = roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.data);
    }

    function roleExpirationDate(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (uint64 expirationDate_) {
        RoleData memory _roleData = roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role];
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
}
