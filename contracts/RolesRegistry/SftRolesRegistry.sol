// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "hardhat/console.sol";
import { IERCXXXX } from "./interfaces/IERCXXXX.sol";
import { BinaryTrees } from "./libraries/BinaryTrees.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { ERC1155Holder, ERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

// todo can revoke role withdraw when the role is expired?
// todo can grant role of an NFT already deposited?

// Semi-fungible token (SFT) roles registry
contract SftRolesRegistry is IERCXXXX, ERC1155Holder {
    using BinaryTrees for BinaryTrees.Trees;
    using BinaryTrees for BinaryTrees.TreeNode;

    // binary tree for each role balance (grantee + role + tokenAddress + tokenId)
    BinaryTrees.Trees internal trees;

    // nonce => RoleData
//    mapping(uint256 => RoleData) public roleAssignments;

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
    {
        require(_roleAssignment.nonce != 0, "RolesRegistry: nonce cannot be zero");
        require(
            _roleAssignment.grantor == msg.sender ||
            IERC1155(_roleAssignment.tokenAddress).isApprovedForAll(_roleAssignment.grantor, msg.sender),
            "RolesRegistry: account not approved"
        );

        bytes32 hash = _hashRoleData(
            _roleAssignment.nonce,
            _roleAssignment.role,
            _roleAssignment.tokenAddress,
            _roleAssignment.tokenId,
            _roleAssignment.grantor
        );

        bytes32 rootKey = _getRootKey(_roleAssignment.grantee, _roleAssignment.role, _roleAssignment.tokenAddress, _roleAssignment.tokenId);
        BinaryTrees.TreeNode storage node = trees.nodes[_roleAssignment.nonce];
        if (node.data.expirationDate == 0) {
            // expirationDate is only zero when the node does not exist
            // transfer tokens to roles registry
            _transferFrom(
                _roleAssignment.grantor,
                address(this),
                _roleAssignment.tokenAddress,
                _roleAssignment.tokenId,
                _roleAssignment.tokenAmount
            );
        } else {
            // if the node exists, check if is expired, is the same grantor, and has enough balance
            require(node.data.hash == hash, "RolesRegistry: nonce exist, but data mismatch"); // validates nonce, role, tokenAddress, tokenId, grantor
            require(node.data.expirationDate < block.timestamp || node.data.revocable, "RolesRegistry: nonce is not expired or is not revocable");
            require(node.data.tokenAmount >= _roleAssignment.tokenAmount, "RolesRegistry: insufficient tokenAmount in nonce");

            // return tokens if any
            uint256 tokensToReturn = node.data.tokenAmount - _roleAssignment.tokenAmount;
            if (tokensToReturn > 0) {
                _transferFrom(
                    address(this),
                    _roleAssignment.grantor,
                    _roleAssignment.tokenAddress,
                    _roleAssignment.tokenId,
                    _roleAssignment.tokenAmount
                );
            }

            // remove node from tree
            trees.remove(rootKey, _roleAssignment.nonce);

        }

        RoleData memory data = RoleData(
            hash,
            _roleAssignment.tokenAmount,
            _roleAssignment.expirationDate,
            _roleAssignment.revocable,
            _roleAssignment.data
        );

        trees.insert(rootKey, _roleAssignment.nonce, data);

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

    function revokeRoleFrom(RevokeRoleData calldata _revokeRoleData) external override {

//        bytes32 hash = _hashRoleData(
//            _revokeRoleData.nonce,
//            _revokeRoleData.role,
//            _revokeRoleData.tokenAddress,
//            _revokeRoleData.tokenId,
//            _revokeRoleData.tokenAmount,
//            _revokeRoleData.revoker,
//            _revokeRoleData.grantee
//        );
//
//        RoleData memory roleData = roleAssignments[_revokeRoleData.nonce];
//        require(roleData.hash == hash, "RolesRegistry: Could not find role assignment");

//        address caller = _findCaller(_revokeRoleData);
//        if (!roleData.revocable) {
//            require(caller == _revokeRoleData.grantee, "RolesRegistry: Role is not revocable or caller is not the approved");
//        }
//
//        _transferFrom(
//            address(this),
//            _revokeRoleData.revoker,
//            _revokeRoleData.tokenAddress,
//            _revokeRoleData.tokenId,
//            _revokeRoleData.tokenAmount
//        );
//
//        delete roleAssignments[_revokeRoleData.nonce];
    }

    function _transferFrom(address _from, address _to, address _tokenAddress, uint256 _tokenId, uint256 _tokenAmount) internal {
        IERC1155(_tokenAddress).safeTransferFrom(_from, _to, _tokenId, _tokenAmount, "");
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

    function isRoleApprovedForAll(
        address _tokenAddress,
        address _grantor,
        address _operator
    ) public view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_operator];
    }

    function roleData(uint256 _recordId) external view returns (RoleData memory data_) {
        return trees.nodes[_recordId].data;
    }

    function roleExpirationDate(uint256 _recordId) external view returns (uint64 expirationDate_) {
        return trees.nodes[_recordId].data.expirationDate;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Receiver, IERC165) returns (bool) {
        return interfaceId == type(IERCXXXX).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    /** Helper Functions **/

    function _hashRoleData(
        uint256 _nonce, bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantor
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(_nonce, _role, _tokenAddress, _tokenId, _grantor));
    }

    function _getRootKey(
        address _grantee, bytes32 _role, address _tokenAddress, uint256 _tokenId
    ) internal pure returns (bytes32 rootKey_) {
        return keccak256(abi.encodePacked(_grantee, _role, _tokenAddress, _tokenId));
    }

}
