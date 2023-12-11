// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

contract RolesRegistry is IERC7432 {
    // grantee => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData)))) public roleAssignments;

    // tokenAddress => tokenId => role => grantee
    mapping(address => mapping(uint256 => mapping(bytes32 => address))) public latestGrantees;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    modifier onlyOwnerOrApproved(
        address _tokenAddress,
        uint256 _tokenId,
        address _account
    ) {
        address _tokenOwner = IERC721(_tokenAddress).ownerOf(_tokenId);
        require(
            msg.sender == _tokenOwner ||
                (isRoleApprovedForAll(_tokenAddress, _account, msg.sender) && _account == _tokenOwner),
            "RolesRegistry: sender must be token owner or approved"
        );
        _;
    }

    modifier isTokenOwner(
        address _tokenAddress,
        uint256 _tokenId,
        address _account
    ) {
        require(_account == IERC721(_tokenAddress).ownerOf(_tokenId), "RolesRegistry: account must be token owner");
        _;
    }

    function grantRoleFrom(
        RoleAssignment calldata _roleAssignment
    )
        external
        override
        onlyOwnerOrApproved(_roleAssignment.tokenAddress, _roleAssignment.tokenId, _roleAssignment.grantor)
    {
        _grantRole(_roleAssignment, false);
    }

    function grantRevocableRoleFrom(
        RoleAssignment calldata _roleAssignment
    )
        external
        override
        onlyOwnerOrApproved(_roleAssignment.tokenAddress, _roleAssignment.tokenId, _roleAssignment.grantor)
    {
        _grantRole(_roleAssignment, true);
    }

    function _grantRole(
        RoleAssignment calldata _roleAssignment,
        bool _revocable
    ) internal validExpirationDate(_roleAssignment.expirationDate) {
        address _lastGrantee = latestGrantees[_roleAssignment.tokenAddress][_roleAssignment.tokenId][
            _roleAssignment.role
        ];
        RoleData memory _roleData = roleAssignments[_lastGrantee][_roleAssignment.tokenAddress][
            _roleAssignment.tokenId
        ][_roleAssignment.role];

        bool _hasActiveAssignment = _roleData.expirationDate > block.timestamp;

        if (_hasActiveAssignment) {
            // only unique roles can be revocable
            require(_roleData.revocable, "RolesRegistry: role is not revocable");
        }

        roleAssignments[_roleAssignment.grantee][_roleAssignment.tokenAddress][_roleAssignment.tokenId][
            _roleAssignment.role
        ] = RoleData(_roleAssignment.expirationDate, _revocable, _roleAssignment.data);
        latestGrantees[_roleAssignment.tokenAddress][_roleAssignment.tokenId][_roleAssignment.role] = _roleAssignment
            .grantee;
        emit RoleGranted(
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.grantor,
            _roleAssignment.grantee,
            _roleAssignment.expirationDate,
            _revocable,
            _roleAssignment.data
        );
    }

    function revokeRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _revoker,
        address _grantee
    ) external override isTokenOwner(_tokenAddress, _tokenId, _revoker) {
        address _caller = msg.sender == _revoker || msg.sender == _grantee
            ? msg.sender
            : _getApprovedCaller(_tokenAddress, _revoker, _grantee);
        _revokeRole(_role, _tokenAddress, _tokenId, _revoker, _grantee, _caller);
    }

    function _getApprovedCaller(
        address _tokenAddress,
        address _revoker,
        address _grantee
    ) internal view returns (address) {
        if (isRoleApprovedForAll(_tokenAddress, _grantee, msg.sender)) {
            return _grantee;
        } else if (isRoleApprovedForAll(_tokenAddress, _revoker, msg.sender)) {
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
        require(
            _caller == _grantee || roleAssignments[_grantee][_tokenAddress][_tokenId][_role].revocable,
            "RolesRegistry: Role is not revocable or caller is not the grantee"
        );
        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        delete latestGrantees[_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _tokenAddress, _tokenId, _revoker, _grantee);
    }

    function hasNonUniqueRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (bool) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
    }

    function hasRole(
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
    ) external view returns (RoleData memory) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
    }

    function roleExpirationDate(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor, // not used, but needed for compatibility with ERC7432
        address _grantee
    ) external view returns (uint64 expirationDate_) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate;
    }

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC7432).interfaceId;
    }

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
    }

    function lastGrantee(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor // not used, but needed for compatibility with ERC7432
    ) public view override returns (address) {
        return latestGrantees[_tokenAddress][_tokenId][_role];
    }
}
