// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERCXXXX } from "../interfaces/IERCXXXX.sol";

library BinaryTrees {

    uint256 public constant EMPTY = 0;
    bool public constant RED = true;
    bool public constant BLACK = false;

    struct Trees {
        // grantee => role => tokenAddress => tokenId => treeRoot
        mapping(bytes32 => uint256) roots;
        // nonce => TreeNode
        mapping (uint256 => TreeNode) nodes;
    }

    struct TreeNode {
        IERCXXXX.RoleData data;
        uint256 parent;
        uint256 left;
        uint256 right;
        bool color;
    }

    // Insert ================================================================

    function insert(Trees storage _self, bytes32 _rootKey, uint256 _nonce, IERCXXXX.RoleData memory _data) internal {

        if (_self.roots[_rootKey] == EMPTY) {
            // if the tree is empty
            // insert node here as black
            _self.roots[_rootKey] = _nonce;
            _self.nodes[_nonce] = TreeNode(_data, 0, 0, 0, BLACK);
        } else {
            // if root exists
            // start searching for the right place to insert it
            (TreeNode storage parent, uint256 parentNonce) = _insertHelper(_self, _self.roots[_rootKey], _nonce, _data.expirationDate);
            // insert new node as red
            _self.nodes[_nonce] = TreeNode(_data, parentNonce, 0, 0, RED);
            // check for violations (only if parent is red)
            if (parent.color == RED) {
                // if parent is red
                // fix violations
                _fixViolations(_self, _self.roots[_rootKey], _self.nodes[_nonce], _nonce, parent, parentNonce);
            }
        }

    }

    function _insertHelper(
        Trees storage _self, uint256 _parentNonce, uint256 _nonce, uint64 _expirationDate
    ) private returns (TreeNode storage parent_, uint256 parentNonce_) {
        TreeNode storage parentNode = _self.nodes[_parentNonce];

        if (parentNode.data.expirationDate > _expirationDate) {
            // if _expirationDate is greater than node's expirationDate
            // check if the right node is empty
            if (parentNode.right == EMPTY) {
                // if it is, insert the new node here
                parentNode.right = _nonce;
                return (parentNode, _parentNonce);
            } else {
                // if not, keep searching
                return _insertHelper(_self, parentNode.right, _nonce, _expirationDate);
            }
        } else {
            // if _expirationDate is lower or equal than node's expirationDate
            // check if the left node is empty
            if (parentNode.left == EMPTY) {
                // if it is, insert the new node here
                parentNode.left = _nonce;
                return (parentNode, _parentNonce);
            } else {
                // if not, keep searching
                return _insertHelper(_self, parentNode.left, _nonce, _expirationDate);
            }
        }
    }

    function _fixViolations(
        Trees storage _self,
        uint256 _root,
        TreeNode storage _node,
        uint256 _nonce,
        TreeNode storage _parent,
        uint256 _parentNonce
    ) private {

        // parent is red
        TreeNode storage uncle = _findUncle(_self, _parentNonce, _parent);
        TreeNode storage grandParent = _self.nodes[_parent.parent];

        if (uncle.color == RED) {
            // if uncle is red
            // flip colors of grandparent, parent, and uncle
            uncle.color = BLACK;
            _parent.color = BLACK;
            // only recolor grandparent if it's not the root
            if (_parent.parent != _root) {
                grandParent.color = RED;
            }
            return;
        }

        // uncle is black
        // need to check if parent and child are left or right nodes

        // parent, node
        // right, right => 3.2.1
        // right, left => 3.2.2
        // left, left => 3.2.3 (same as right, right or 3.2.1)
        // left, right => 3.2.4 (same as right, left or 3.2.2)

        if (grandParent.right == _parentNonce) {
            // parent is the right child of grandparent (3.2.1 and 3.2.2)

            if (_parent.left == _nonce) {
                // node is the left child of parent (3.2.2)
                // right rotate parent
                _rightRotation(_self, _parent, _parentNonce);
            }

            // node is the right child of parent (3.2.1)
            _leftRotateAndUpdateRelativesColor(_self, _node, _nonce);

        } else {
            // parent is the left child of grandparent (3.2.3 and 3.2.4)

            if (_parent.right == _nonce) {
                // node is the right child of parent (3.2.4)
                // right rotate parent
                _rightRotation(_self, _parent, _parentNonce);
            }

            // node is the left child of parent (3.2.3)
            _leftRotateAndUpdateRelativesColor(_self, _node, _nonce);

        }

    }

    function _leftRotateAndUpdateRelativesColor(Trees storage _self, TreeNode storage _node, uint256 _nonce) private {
        // left rotate grandparent
        TreeNode storage currentParent = _self.nodes[_node.parent];
        _leftRotation(_self, _self.nodes[currentParent.parent], currentParent.parent);

        // change the color of parent to black
        _self.nodes[_node.parent].color = BLACK;

        // change the color of the new sibling to red
        TreeNode storage updatedParent = _self.nodes[_node.parent];
        if (updatedParent.right == _nonce) {
            _self.nodes[updatedParent.left].color = RED;
        } else {
            _self.nodes[updatedParent.right].color = RED;
        }
    }

    // Helpers ===============================================================

    function _findUncle(
        Trees storage _self, uint256 _parentNonce, TreeNode storage _parent
    ) private view returns (TreeNode storage uncle_) {
        TreeNode storage grandParent = _self.nodes[_parent.parent];
        if (_parentNonce == grandParent.right) {
            return _self.nodes[grandParent.left];
        } else {
            return _self.nodes[grandParent.right];
        }
    }

    function _leftRotation(
        Trees storage _self, TreeNode storage _node, uint256 _nonce
    ) private returns (TreeNode storage node_) {
        TreeNode storage rightChild = _self.nodes[_node.right];
        uint256 rightChildLeftChildNonce = rightChild.left;
        TreeNode storage rightChildLeftChild = _self.nodes[rightChildLeftChildNonce];


        // rightChildLeftChild's parent becomes its grandparent
        rightChildLeftChild.parent = _node.parent;

        // rightChild's parent becomes its grandparent
        rightChild.parent = _node.parent;
        // rightChild's left node becomes _node
        rightChild.left = _nonce;

        // _node's parent becomes its right child
        _node.parent = _node.right;
        // node's right child becomes its rightChild's left node
        _node.right = rightChildLeftChildNonce;

        return _node;
    }

    function _rightRotation(
        Trees storage _self, TreeNode storage _node, uint256 _nonce
    ) private returns (TreeNode storage node_) {
        TreeNode storage oldParent = _self.nodes[_node.parent];
        TreeNode storage rightChildNode = _self.nodes[_node.right];
        uint256 rightChildNonce = _node.right;

        // rightChildNode's parent becomes oldParent
        rightChildNode.parent = _node.parent;

        // _node's right child becomes its parent
        _node.right = _node.parent;
        // _node's parent becomes its grandparent
        _node.parent = oldParent.parent;


        // _oldParent's parent becomes _node
        oldParent.parent = _nonce;
        // _oldParent's left child becomes _node's right child
        oldParent.left = rightChildNonce;

        return _node;
    }


//    function flipColor(TreeNode storage _node) private {
//        _node.color = !_node.color;
//    }

    // =======================================================================

    // todo verify more edge cases
    function remove(Trees storage _self, bytes32 _rootKey, uint256 _nonce) internal {
        TreeNode storage _nodeToRemove = _self.nodes[_nonce];

//        // modify removed nonce parent
//        if (_nodeToRemove.parent != EMPTY) {
//            TreeNode storage _parent = _self.nodes[_nodeToRemove.parent];
//            if (_parent.left == _nonce) {
//                _parent.left = EMPTY;
//            } else {
//                _parent.right = EMPTY;
//            }
//        }

        // modify right node
        if (_nodeToRemove.right != EMPTY) {
            TreeNode storage _right = _self.nodes[_nodeToRemove.right];
            _right.parent = _nodeToRemove.parent;
        }

        // modify left node
//        if (_nodeToRemove.left != EMPTY) {
//            TreeNode storage _left = _self.nodes[_nodeToRemove.left];
//            TreeNode storage node = _insertHelper(_self, _nodeToRemove.right, _nodeToRemove.left, _nodeToRemove.data.expirationDate);
//            _left.parent = node.parent;
//        }

        // modify left node's parent

    }

}