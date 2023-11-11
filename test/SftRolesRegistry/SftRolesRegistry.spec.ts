import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { buildRoleAssignment, currentUnixTimestamp, ONE_DAY, generateRoleId } from './helpers'
import { RoleAssignment } from './types'
import { generateRandomInt } from '../helpers'

const { AddressZero } = ethers.constants

describe('SftRolesRegistry', async () => {
  let SftRolesRegistry: Contract
  let MockToken: Contract
  let grantor: SignerWithAddress
  let anotherUser: SignerWithAddress

  async function deployContracts() {
    const SftRolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistry')
    SftRolesRegistry = await SftRolesRegistryFactory.deploy()
    const MockTokenFactory = await ethers.getContractFactory('MockERC1155')
    MockToken = await MockTokenFactory.deploy()
    const signers = await ethers.getSigners()
    grantor = signers[0]
    anotherUser = signers[1]
    return { SftRolesRegistry, MockToken, signers }
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  describe('grantRole', async () => {
    it('should revert without a reason if tokenAddress is not an ERC-1155 contract', async () => {
      const roleAssignment = await buildRoleAssignment()
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.reverted
    })

    it('should revert if expirationDate is in the past', async () => {
      const roleAssignment = await buildRoleAssignment({
        expirationDate: currentUnixTimestamp() - ONE_DAY,
      })
      await expect(SftRolesRegistry.grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: expiration date must be in the future',
      )
    })

    it('should revert when sender is not grantor or approved', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
      })
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert if contract cannot transfer tokens', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'ERC1155: caller is not token owner or approved',
      )
    })

    it('should revert if tokenAmount is zero', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAmount: 0,
      })
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: tokenAmount must be greater than zero',
      )
    })

    it('should revert when grantor does not have enough tokens', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        tokenAmount: 100,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount - 10)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'ERC1155: insufficient balance for transfer',
      )
    })

    it('should revert if nonce is zero', async () => {
      const roleAssignment = await buildRoleAssignment({
        nonce: 0,
        tokenAddress: MockToken.address,
        grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'LinkedLists: invalid nonce',
      )
      expect(await MockToken.balanceOf(grantor.address, roleAssignment.tokenId)).to.be.equal(roleAssignment.tokenAmount)
    })

    describe('when nonce does not exist', async () => {
      it('should grant role when grantor is sender and has enough tokens', async () => {
        const roleAssignment = await buildRoleAssignment({
          tokenAddress: MockToken.address,
          grantor: grantor.address,
        })
        await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
        await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
        await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
          .to.emit(SftRolesRegistry, 'RoleGranted')
          .withArgs(
            roleAssignment.nonce,
            roleAssignment.role,
            roleAssignment.tokenAddress,
            roleAssignment.tokenId,
            roleAssignment.tokenAmount,
            roleAssignment.grantor,
            roleAssignment.grantee,
            roleAssignment.expirationDate,
            roleAssignment.revocable,
            roleAssignment.data,
          )
      })

      it('should grant role when sender is approved and grantor has enough tokens', async () => {
        const roleAssignment = await buildRoleAssignment({
          tokenAddress: MockToken.address,
          grantor: grantor.address,
        })
        await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
        await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
        await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
          roleAssignment.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(SftRolesRegistry.connect(anotherUser).grantRoleFrom(roleAssignment))
          .to.emit(SftRolesRegistry, 'RoleGranted')
          .withArgs(
            roleAssignment.nonce,
            roleAssignment.role,
            roleAssignment.tokenAddress,
            roleAssignment.tokenId,
            roleAssignment.tokenAmount,
            roleAssignment.grantor,
            roleAssignment.grantee,
            roleAssignment.expirationDate,
            roleAssignment.revocable,
            roleAssignment.data,
          )
      })
    })
  })

  describe('when nonce exists', async () => {
    let RoleAssignment: RoleAssignment

    beforeEach(async () => {
      RoleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, RoleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment))
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          RoleAssignment.tokenAmount,
          RoleAssignment.grantor,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
    })

    it('should revert if hash is different', async () => {
      // hash validates role, tokenAddress, tokenId, grantor

      // different role
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          role: generateRoleId('Role(uint256 newArg)'),
        }),
      ).to.be.revertedWith('SftRolesRegistry: nonce exist, but data mismatch')

      // tokenAddress
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAddress: AddressZero,
        }),
      ).to.be.revertedWith('SftRolesRegistry: nonce exist, but data mismatch')

      // tokenId
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenId: generateRandomInt(),
        }),
      ).to.be.revertedWith('SftRolesRegistry: nonce exist, but data mismatch')

      // grantor
      await SftRolesRegistry.connect(anotherUser).setRoleApprovalForAll(
        RoleAssignment.tokenAddress,
        grantor.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          grantor: anotherUser.address,
        }),
      ).to.be.revertedWith('SftRolesRegistry: nonce exist, but data mismatch')
    })

    it('should revert if nonce is not expired', async () => {
      const revocableRoleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        revocable: false,
      })

      await MockToken.mint(grantor.address, revocableRoleAssignment.tokenId, revocableRoleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(revocableRoleAssignment))
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          revocableRoleAssignment.nonce,
          revocableRoleAssignment.role,
          revocableRoleAssignment.tokenAddress,
          revocableRoleAssignment.tokenId,
          revocableRoleAssignment.tokenAmount,
          revocableRoleAssignment.grantor,
          revocableRoleAssignment.grantee,
          revocableRoleAssignment.expirationDate,
          revocableRoleAssignment.revocable,
          revocableRoleAssignment.data,
        )

      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(revocableRoleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: nonce is not expired or is not revocable',
      )
    })

    it("should revert if grantor's balance is insufficient", async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAmount: RoleAssignment.tokenAmount + 1,
        }),
      ).to.be.revertedWith('ERC1155: insufficient balance for transfer')
    })

    it('should grant role if tokens deposited are greater than requested', async () => {
      const newTokenAmount = RoleAssignment.tokenAmount - 1
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAmount: newTokenAmount,
        }),
      )
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          newTokenAmount,
          RoleAssignment.grantor,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
        // transfer leftover tokens to grantor
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          RoleAssignment.grantor,
          RoleAssignment.tokenId,
          RoleAssignment.tokenAmount - newTokenAmount,
        )
    })

    it('should grant role if tokens deposited are lower than deposited (but grantor deposits more)', async () => {
      const additionalAmount = 1
      const newTokenAmount = RoleAssignment.tokenAmount + additionalAmount
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, additionalAmount)

      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAmount: newTokenAmount,
        }),
      )
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          newTokenAmount,
          RoleAssignment.grantor,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
        // transfer additional tokens to contract
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          RoleAssignment.grantor,
          SftRolesRegistry.address,
          RoleAssignment.tokenId,
          additionalAmount,
        )
    })

    it('should grant role if tokens deposited are equal to tokens requested', async () => {
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment))
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          RoleAssignment.tokenAmount,
          RoleAssignment.grantor,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
        // should not transfer any tokens
        .to.not.emit(MockToken, 'TransferSingle')
    })
  })
})
