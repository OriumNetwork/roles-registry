// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from "./interfaces/IERCXXXX.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { ERC1155Holder, ERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is IERCXXXX, ERC1155Holder, EIP712("SftRolesRegistry", "1") {
    using BitMaps for BitMaps.BitMap;
    using EnumerableSet for EnumerableSet.UintSet;

    uint256 public constant MAX_RECORDS = 1000;

    uint256 public recordCount;
    BitMaps.BitMap internal isRevocable;

    // recordId => RoleData
    mapping(uint256 => RoleData) public roleAssignments;

    // grantee => tokenAddress => tokenId => role => [recordId]
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => EnumerableSet.UintSet)))) internal granteeToRoleAssignments;

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

    /** External Functions **/

    function grantRoleFrom(RoleAssignment calldata _roleAssignment)
        external
        override
        validExpirationDate(_roleAssignment.expirationDate)
        returns (uint256 recordId_)
    {
        require(
            granteeToRoleAssignments[_roleAssignment.grantee][_roleAssignment.tokenAddress][_roleAssignment.tokenId][
                _roleAssignment.role
            ].length() < MAX_RECORDS,
            "RolesRegistry: max records reached"
        );
        require(
            _roleAssignment.grantor == msg.sender ||
            IERC1155(_roleAssignment.tokenAddress).isApprovedForAll(_roleAssignment.grantor, msg.sender),
            "RolesRegistry: account not approved"
        );

        _transferFrom(
            _roleAssignment.grantor,
            address(this),
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount
        );

        recordId_ = _createRoleAssignment(_roleAssignment);

        emit RoleGranted(
            recordId_,
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

    function _createRoleAssignment(RoleAssignment calldata _roleAssignment) internal returns (uint256 recordId_) {
        recordId_ = recordCount++;
        bytes32 hashedData = _hashRoleData(recordId_, _roleAssignment);

        roleAssignments[recordId_] = RoleData(hashedData, _roleAssignment.tokenAmount, _roleAssignment.expirationDate, _roleAssignment.data);
        if (_roleAssignment.revocable) {
            isRevocable.set(recordId_);
        }

        granteeToRoleAssignments[_roleAssignment.grantee][_roleAssignment.tokenAddress][_roleAssignment.tokenId][
            _roleAssignment.role
        ].add(recordId_);
    }

    function revokeRoleFrom(RevokeRoleData calldata _revokeRoleData) external override {
        require(
            roleAssignments[_revokeRoleData.recordId].hash == _hashRoleData(_revokeRoleData),
            "RolesRegistry: invalid revoke role data"
        );

        address caller = _findCaller(_revokeRoleData);
        if (!isRevocable.get(_revokeRoleData.recordId)) {
            require(caller == _revokeRoleData.grantee, "RolesRegistry: Role is not revocable or caller is not the approved");
        } else {
            isRevocable.unset(_revokeRoleData.recordId);
        }

        _transferFrom(
            address(this),
            _revokeRoleData.revoker,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            _revokeRoleData.tokenAmount
        );

        delete roleAssignments[_revokeRoleData.recordId];
        granteeToRoleAssignments[_revokeRoleData.grantee][_revokeRoleData.tokenAddress][_revokeRoleData.tokenId][
            _revokeRoleData.role
        ].remove(_revokeRoleData.recordId);
    }

    function _transferFrom(address _from, address _to, address _tokenAddress, uint256 _tokenId, uint256 _tokenAmount) internal {
        IERC1155(_tokenAddress).safeTransferFrom(_from, _to, _tokenId, _tokenAmount, "");
    }

    function _hashRoleData(RevokeRoleData calldata _revokeRoleData) internal view returns (bytes32) {
        return _hashRoleData(
            _revokeRoleData.recordId,
            _revokeRoleData.role,
            _revokeRoleData.tokenAddress,
            _revokeRoleData.tokenId,
            _revokeRoleData.tokenAmount,
            _revokeRoleData.revoker,
            _revokeRoleData.grantee
        );
    }

    function _hashRoleData(uint256 _recordId, RoleAssignment calldata _roleAssignment) internal view returns (bytes32) {
        return _hashRoleData(
            _recordId,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.tokenAmount,
            _roleAssignment.grantor,
            _roleAssignment.grantee
        );
    }

    function _hashRoleData(
        uint256 _recordId,
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
                        "RoleAssignment(uint256 recordId,bytes32 role,address tokenAddress,uint256 tokenId,uint256 tokenAmount,address grantor,address grantee)"
                    ),
                    _recordId,
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

    function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external override {
        tokenApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
    }

    /** View Functions **/

    function roleData(uint256 _recordId) external view returns (RoleData memory) {
        return roleAssignments[_recordId];
    }

    function roleExpirationDate(uint256 _recordId) external view returns (uint64 expirationDate_) {
        return roleAssignments[_recordId].expirationDate;
    }

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
    }

    function roleBalanceOf(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee
    ) external view returns (uint256 balance_) {
        balance_ = 0;
        for (uint256 i = 0; i < granteeToRoleAssignments[_grantee][_tokenAddress][_tokenId][_role].length(); i++) {
            uint256 recordId = granteeToRoleAssignments[_grantee][_tokenAddress][_tokenId][_role].at(i);
            if (roleAssignments[recordId].expirationDate > block.timestamp) {
                balance_ += roleAssignments[recordId].tokenAmount;
            }
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Receiver, IERC165) returns (bool) {
        return interfaceId == type(IERCXXXX).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId;
    }

}
