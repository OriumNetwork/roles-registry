import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { buildRoleAssignment, currentUnixTimestamp, ONE_DAY } from './helpers'

// grantRoleFrom
  // when nonce does not exist
    // should revert if grantor does not have enough tokens
    // should revert if tokenAmount is zero
    // should grant role when grantor is sender and has enough tokens
    // should grant role when sender is approved and grantor has enough tokens
    // grant role to two different users and have separate balances
    // grant role and wait for it to automatically expire
  // when nonce exists
    // tbd

describe.only('SftRolesRegistry', async () => {
  let SftRolesRegistry: Contract
  let MockToken: Contract
  let grantor: SignerWithAddress

  async function deployContracts() {
    const SftRolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistry')
    SftRolesRegistry = await SftRolesRegistryFactory.deploy()
    const MockTokenFactory = await ethers.getContractFactory('MockERC1155')
    MockToken = await MockTokenFactory.deploy()
    const signers = await ethers.getSigners()
    grantor = signers[0]
    return { SftRolesRegistry, MockToken, signers }
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  describe('grantRole', async () => {

    it('should revert without a reason if tokenAddress is not an ERC-1155 contract', async () => {
      const roleAssignment = buildRoleAssignment()
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.reverted
    })

    it('should revert if expirationDate is in the past', async () => {
      const roleAssignment = buildRoleAssignment({
        expirationDate: currentUnixTimestamp() - ONE_DAY,
      })
      await expect(SftRolesRegistry.grantRoleFrom(roleAssignment))
        .to.be.revertedWith('SftRolesRegistry: expiration date must be in the future')
    })

    it('should revert when sender is not grantor or approved', async () => {
      const roleAssignment = buildRoleAssignment({
        tokenAddress: MockToken.address,
      })
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.be.revertedWith('SftRolesRegistry: account not approved')
    })

    it('should revert if contract cannot transfer tokens', async () => {
      const roleAssignment = buildRoleAssignment({
        tokenAddress: MockToken.address, grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })



    it('should revert if tokenAmount is zero', async () => {
      const roleAssignment = buildRoleAssignment({
        tokenAmount: 0
      })
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.be.revertedWith('SftRolesRegistry: tokenAmount must be greater than zero')
    })

    it('should revert when grantor does not have enough tokens', async () => {
      const roleAssignment = buildRoleAssignment({
        tokenAddress: MockToken.address, grantor: grantor.address, tokenAmount: 100,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount - 10)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.be.revertedWith('SftRolesRegistry: account has insufficient balance')
    })

    // todo tbd
    it('should revert if nonce is zero', async () => {
      const roleAssignment = buildRoleAssignment({
        nonce: 0, tokenAddress: MockToken.address, grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.be.revertedWith('LinkedLists: invalid nonce')
      expect(await MockToken.balanceOf(grantor.address, roleAssignment.tokenId))
        .to.be.equal(roleAssignment.tokenAmount)
    })


  })

})
