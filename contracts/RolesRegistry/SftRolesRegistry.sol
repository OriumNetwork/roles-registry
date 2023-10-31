// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;
pragma abicoder v2;

import "hardhat/console.sol";
import { IERC8000 } from "./interfaces/IERC8000.sol";
import { ERC1155Holder } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

// todo can revoke role withdraw when the role is expired?
// todo can grant role of an NFT already deposited?

// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is IERC8000, ERC1155Holder, EIP712("ERC1155RolesRegistry", "1") {

    // recordId => RoleData
    mapping(uint256 => RoleData) public roleAssignments;

    // grantor => tokenAddress => operator => isApproved
    mapping(address => mapping(address => mapping(address => bool))) public tokenApprovals;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    modifier onlyOwnerOrApprovedWithBalance(address _account, address _tokenAddress, uint256 _tokenId, uint256 _tokenAmount) {
        require(
            (_account == msg.sender || IERC1155(_tokenAddress).isApprovedForAll(_account, msg.sender)) &&
                IERC1155(_tokenAddress).balanceOf(_account, _tokenId) >= _tokenAmount,
            "RolesRegistry: account not approved or has insufficient balance"
        );
        _;
    }

    function grantRoleFrom(RoleAssignment calldata _roleAssignment)
        external
        override
        validExpirationDate(_roleAssignment.expirationDate)
    {
        require(
            _roleAssignment.grantor == msg.sender ||
            IERC1155(_roleAssignment.tokenAddress).isApprovedForAll(_roleAssignment.grantor, msg.sender),
            "RolesRegistry: account not approved"
        );

        if (roleAssignments[_roleAssignment.nonce].expirationDate == 0) {

            // if role assignment does not exist
            _transferFrom(
                _roleAssignment.grantor,
                address(this),
                _roleAssignment.tokenAddress,
                _roleAssignment.tokenId,
                _roleAssignment.tokenAmount
            );

        } else {
            // todo
            // if role assignment exist
            require(roleAssignments[_roleAssignment.nonce].expirationDate < block.timestamp, "RolesRegistry: nonce provided is not expired");
            require(
                roleAssignments[_roleAssignment.nonce].tokenAddress == _roleAssignment.tokenAddress &&
                    roleAssignments[_roleAssignment.nonce].tokenAmount >= _roleAssignment.tokenAmount,
                "RolesRegistry: token amount must be greater or equal to the provided"
            );

            uint256 amountToWithdraw = roleAssignments[_roleAssignment.nonce].tokenAmount - _roleAssignment.tokenAmount;
            if (amountToWithdraw > 0) {
                _transferFrom(
                    address(this),
                    _roleAssignment.grantor,
                    _roleAssignment.tokenAddress,
                    _roleAssignment.tokenId,
                    amountToWithdraw
                );
            }

        }

        _createRoleAssignment(_roleAssignment);

        emit RoleGranted(
            _roleAssignment.nonce,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount,
            _roleAssignment.grantor,
            _roleAssignment.grantee,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );
    }

    function _createRoleAssignment(RoleAssignment calldata _roleAssignment) internal {
        bytes32 _hashedAssignment = _hashRoleData(
            _roleAssignment.nonce,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount,
            _roleAssignment.grantor,
            _roleAssignment.grantee
        );

        roleAssignments[_roleAssignment.nonce] = RoleData(
            _hashedAssignment,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );

    }

    function revokeRoleFrom(RevokeRoleData calldata _revokeRoleData) external override {

        bytes32 hash = _hashRoleData(
            _revokeRoleData.nonce,
            _revokeRoleData.role,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            _revokeRoleData.tokenAmount,
            _revokeRoleData.revoker,
            _revokeRoleData.grantee
        );

        RoleData memory roleData = roleAssignments[_revokeRoleData.nonce];
        require(roleData.hash == hash, "RolesRegistry: Could not find role assignment");

        address caller = _findCaller(_revokeRoleData);
        if (!roleData.revocable) {
            require(caller == _revokeRoleData.grantee, "RolesRegistry: Role is not revocable or caller is not the approved");
        }

        _transferFrom(
            address(this),
            _revokeRoleData.revoker,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            _revokeRoleData.tokenAmount
        );

        delete roleAssignments[_revokeRoleData.nonce];
    }

    function _transferFrom(address _from, address _to, address _tokenAddress, uint256 _tokenId, uint256 _tokenAmount) internal {
        IERC1155(_tokenAddress).safeTransferFrom(_from, _to, _tokenId, _tokenAmount, "");
    }

    function _hashRoleData(
        uint256 _nonce,
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        address _grantor,
        address _grantee
    ) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256(
                        "RoleAssignment(uint256 nonce,bytes32 role,address tokenAddress,uint256 tokenId,uint256 tokenAmount,address grantor,address grantee)"
                    ),
                    _nonce,
                    _role,
                    _tokenAddress,
                    _tokenId,
                    _tokenAmount,
                    _grantor,
                    _grantee
                )
            )
        );
    }

    function _findCaller(RevokeRoleData calldata _revokeRoleData) internal view returns (address) {
        if (_revokeRoleData.revoker == msg.sender ||
            isRoleApprovedForAll(_revokeRoleData.tokenAddress, _revokeRoleData.revoker, msg.sender)
        ) {
            return _revokeRoleData.revoker;
        }

        if (_revokeRoleData.grantee == msg.sender ||
            isRoleApprovedForAll(_revokeRoleData.tokenAddress, _revokeRoleData.grantee, msg.sender)
        ) {
            return _revokeRoleData.grantee;
        }

        revert("RolesRegistry: sender must be approved");
    }

//    function _getApprovedCaller(
//        address _tokenAddress,
//        address _revoker,
//        address _grantee
//    ) internal view returns (address) {
//        if (isRoleApprovedForAll(_tokenAddress, _grantee, msg.sender)) {
//            return _grantee;
//        } else if (isRoleApprovedForAll(_tokenAddress, _revoker, msg.sender)) {
//            return _revoker;
//        } else {
//            revert("RolesRegistry: sender must be approved");
//        }
//    }

//    function _revokeRole(
//        bytes32 _role,
//        address _tokenAddress,
//        uint256 _tokenId,
//        address _revoker,
//        address _grantee,
//        address _caller
//    ) internal {
//        require(
//            _caller == _grantee || roleAssignments[_grantee][_tokenAddress][_tokenId][_role].revocable,
//            "RolesRegistry: Role is not revocable or caller is not the grantee"
//        );
//        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
//        delete latestGrantees[_tokenAddress][_tokenId][_role];
//        emit RoleRevoked(_role, _tokenAddress, _tokenId, _revoker, _grantee);
//    }

//    function hasNonUniqueRole(
//        bytes32 _role,
//        address _tokenAddress,
//        uint256 _tokenId,
//        address _grantor, // not used, but needed for compatibility with ERC7432
//        address _grantee
//    ) external view returns (bool) {
//        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
//    }
//
//    function hasRole(
//        bytes32 _role,
//        address _tokenAddress,
//        uint256 _tokenId,
//        address _grantor, // not used, but needed for compatibility with ERC7432
//        address _grantee
//    ) external view returns (bool) {
//        return
//            latestGrantees[_tokenAddress][_tokenId][_role] == _grantee &&
//            roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
//    }

//    function roleData(uint256 _recordId) external view returns (RoleData memory) {
//        return roleAssignments[_recordId];
//    }
//
//    function roleExpirationDate(uint256 _recordId) external view returns (uint64 expirationDate_) {
//        return roleAssignments[_recordId].expirationDate;
//    }

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

    // Other ERCs

//    function supportsInterface(bytes4 interfaceId) external view virtual override(ERC1155Holder) returns (bool) {
//        return interfaceId == type(IERC8000).interfaceId || interfaceId == type(IERC1155).interfaceId;
//    }

}
