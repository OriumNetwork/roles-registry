// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";

contract ERC7432 is IERC7432 {
    // owner => user => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData)))))
        public roleAssignments;

    // owner => tokenAddress => tokenId => role => user
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => address)))) public lastRoleAssignment;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "ERC7432: expiration date must be in the future");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external validExpirationDate(_expirationDate) {
        roleAssignments[msg.sender][_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        lastRoleAssignment[msg.sender][_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_role, _tokenAddress, _tokenId, _grantee, _expirationDate, _data);
    }

    function revokeRole(bytes32 _role, address _grantee, address _tokenAddress, uint256 _tokenId) external {
        delete roleAssignments[msg.sender][_grantee][_tokenAddress][_tokenId][_role];
        delete lastRoleAssignment[msg.sender][_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _tokenAddress, _tokenId, _grantee);
    }

    function hasRole(
        bytes32 _role,
        address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
        bool _supportsMultipleAssignments
    ) external view returns (bool) {
        bool isValid = roleAssignments[_granter][_grantee][_tokenAddress][_tokenId][_role].expirationDate >
            block.timestamp;

        if (_supportsMultipleAssignments) {
            return isValid;
        } else {
            return isValid && lastRoleAssignment[_granter][_tokenAddress][_tokenId][_role] == _grantee;
        }
    }

    function roleData(
        bytes32 _role,
        address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId
    ) external view returns (bytes memory data_) {
        RoleData memory _roleData = roleAssignments[_granter][_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.data);
    }

     function roleExpirationDate(
        bytes32 _role,
        address _grantor,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId
    ) external view returns (uint64 expirationDate_){
        RoleData memory _roleData = roleAssignments[_grantor][_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.expirationDate);
    }

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC7432).interfaceId;
    }
}
