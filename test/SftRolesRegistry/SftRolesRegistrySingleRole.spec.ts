import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { buildRoleAssignment, ONE_DAY, buildRevokeRoleData, generateRoleId } from './helpers'
import { RoleAssignment, RevokeRoleData } from './types'
import { generateRandomInt } from '../helpers'

const { AddressZero } = ethers.constants

describe('SftRolesRegistrySingleRole', async () => {
  let SftRolesRegistry: Contract
  let MockToken: Contract
  let grantor: SignerWithAddress
  let grantee: SignerWithAddress
  let anotherUser: SignerWithAddress

  async function deployContracts() {
    const SftRegistryFactory = await ethers.getContractFactory('SftRolesRegistrySingleRole')
    SftRolesRegistry = await SftRegistryFactory.deploy()
    const MockTokenFactory = await ethers.getContractFactory('MockERC1155')
    MockToken = await MockTokenFactory.deploy()
    const signers = await ethers.getSigners()
    grantor = signers[0]
    grantee = signers[1]
    anotherUser = signers[2]
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
        expirationDate: (await time.latest()) - ONE_DAY,
      })
      await expect(SftRolesRegistry.grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: expiration date must be in the future',
      )
    })

    it('should revert when sender is not grantor or approved', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantee: grantee.address,
      })
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert if contract cannot transfer tokens', async () => {
      const roleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
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
        grantee: grantee.address,
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
        'SftRolesRegistry: nonce must be greater than zero',
      )
      expect(await MockToken.balanceOf(grantor.address, roleAssignment.tokenId)).to.be.equal(roleAssignment.tokenAmount)
    })

    it('should revert if role is not UNIQUE_ROLE', async () => {
      const roleAssignment = await buildRoleAssignment({
        role: 'NOT_UNIQUE_ROLE',
        tokenAddress: MockToken.address,
        grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: role not supported',
      )
    })

    it('should revert if grantee is zero address', async () => {
      const roleAssignment = await buildRoleAssignment({
        grantee: AddressZero,
        tokenAddress: MockToken.address,
        grantor: grantor.address,
      })
      await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: grantee must not be zero address',
      )
    })

    describe('when nonce does not exist', async () => {
      it('should grant role when grantor is sender and has enough tokens', async () => {
        const roleAssignment = await buildRoleAssignment({
          tokenAddress: MockToken.address,
          grantor: grantor.address,
          grantee: grantee.address,
        })
        await MockToken.mint(grantor.address, roleAssignment.tokenId, roleAssignment.tokenAmount)
        await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
        await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
          .to.emit(SftRolesRegistry, 'RoleGranted')
          .withArgs(
            roleAssignment.grantor,
            roleAssignment.nonce,
            roleAssignment.role,
            roleAssignment.tokenAddress,
            roleAssignment.tokenId,
            roleAssignment.tokenAmount,
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
          grantee: grantee.address,
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
            roleAssignment.grantor,
            roleAssignment.nonce,
            roleAssignment.role,
            roleAssignment.tokenAddress,
            roleAssignment.tokenId,
            roleAssignment.tokenAmount,
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
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, RoleAssignment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment))
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.grantor,
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          RoleAssignment.tokenAmount,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
    })

    it('should revert if nonce is not expired', async () => {
      const revocableRoleAssignment = await buildRoleAssignment({
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
      })

      await MockToken.mint(grantor.address, revocableRoleAssignment.tokenId, revocableRoleAssignment.tokenAmount)
      await SftRolesRegistry.connect(grantor).grantRoleFrom(revocableRoleAssignment)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(revocableRoleAssignment)).to.be.revertedWith(
        'SftRolesRegistry: nonce is not expired or is not revocable',
      )
    })

    it("should revert if grantor's balance is insufficient", async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          nonce: generateRandomInt(),
          tokenAmount: RoleAssignment.tokenAmount * 2,
        }),
      ).to.be.revertedWith('ERC1155: insufficient balance for transfer')
    })

    it('should revert if tokenAddress mismatch', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAddress: anotherUser.address,
        }),
      ).to.be.revertedWith('SftRolesRegistry: tokenAddress mismatch')
    })
    it('should revert if tokenId mismatch', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenId: generateRandomInt(),
        }),
      ).to.be.revertedWith('SftRolesRegistry: tokenId mismatch')
    })
    it('should revert if tokenAmount mismatch', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRoleFrom({
          ...RoleAssignment,
          tokenAmount: generateRandomInt(),
        }),
      ).to.be.revertedWith('SftRolesRegistry: tokenAmount mismatch')
    })

    it('should grant role if tokens deposited are equal to tokens requested', async () => {
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment))
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          RoleAssignment.grantor,
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.tokenAddress,
          RoleAssignment.tokenId,
          RoleAssignment.tokenAmount,
          RoleAssignment.grantee,
          RoleAssignment.expirationDate,
          RoleAssignment.revocable,
          RoleAssignment.data,
        )
        // should not transfer any tokens
        .to.not.emit(MockToken, 'TransferSingle')
    })
  })

  describe('revokeRole', async () => {
    let RoleAssignment: RoleAssignment
    let RevokeRoleData: RevokeRoleData

    beforeEach(async () => {
      RoleAssignment = await buildRoleAssignment({
        role: 'UNIQUE_ROLE',
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
      })
      RevokeRoleData = buildRevokeRoleData(RoleAssignment)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, RoleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment)).to.not.be.reverted
    })

    it('should revert if grantee is invalid', async () => {
      const newRoleAssignment = await buildRoleAssignment({
        role: 'UNIQUE_ROLE',
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
      })

      const newRevokeRoleData = buildRevokeRoleData(newRoleAssignment)
      await MockToken.mint(newRoleAssignment.grantor, newRoleAssignment.tokenId, newRoleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(newRoleAssignment))

      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(newRevokeRoleData.grantor, newRevokeRoleData.nonce, newRevokeRoleData.role, AddressZero),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
    })

    it('should revert if nonce is not expired and is not revocable', async () => {
      const newRoleAssignment = await buildRoleAssignment({
        nonce: generateRandomInt(),
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
      })

      const newRevokeRoleData = buildRevokeRoleData(newRoleAssignment)
      await MockToken.mint(newRoleAssignment.grantor, newRoleAssignment.tokenId, newRoleAssignment.tokenAmount)
      await SftRolesRegistry.connect(grantor).grantRoleFrom(newRoleAssignment)

      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          newRevokeRoleData.grantor,
          newRevokeRoleData.nonce,
          newRevokeRoleData.role,
          newRevokeRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: nonce is not expired or is not revocable')
    })

    it('should revert if caller is not approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: sender must be approved')
    })

    it('should revoke role if sender is revoker', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.tokenAddress,
          RevokeRoleData.tokenId,
          RoleAssignment.tokenAmount,
          RevokeRoleData.grantee,
        )
    })

    it('should revert if role is not UNIQUE_ROLE', async () => {
      const newRoleAssignment = await buildRoleAssignment({
        nonce: generateRandomInt(),
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
        role: 'NOT_UNIQUE_ROLE',
      })

      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          RevokeRoleData.grantor,
          newRoleAssignment.nonce,
          newRoleAssignment.role,
          newRoleAssignment.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role not supported')
    })

    it('should revoke role if sender is approved by grantor', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        RoleAssignment.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.tokenAddress,
          RevokeRoleData.tokenId,
          RoleAssignment.tokenAmount,
          RevokeRoleData.grantee,
        )
    })
    it('should revoke role if sender is approved by grantee', async () => {
      await SftRolesRegistry.connect(grantee).setRoleApprovalForAll(
        RoleAssignment.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(
          RevokeRoleData.grantor,
          RevokeRoleData.nonce,
          RevokeRoleData.role,
          RevokeRoleData.tokenAddress,
          RevokeRoleData.tokenId,
          RoleAssignment.tokenAmount,
          RevokeRoleData.grantee,
        )
    })

    it('should revoke role if sender is grantee', async () => {
      const newRoleAssignment = await buildRoleAssignment({
        nonce: generateRandomInt(),
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
      })

      const newRevokeRoleData = buildRevokeRoleData(newRoleAssignment)

      await MockToken.mint(newRoleAssignment.grantor, newRoleAssignment.tokenId, newRoleAssignment.tokenAmount)
      await SftRolesRegistry.connect(grantor).grantRoleFrom(newRoleAssignment)

      await expect(
        SftRolesRegistry.connect(grantee).revokeRoleFrom(
          RevokeRoleData.grantor,
          newRevokeRoleData.nonce,
          newRevokeRoleData.role,
          RevokeRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(
          newRevokeRoleData.grantor,
          newRevokeRoleData.nonce,
          newRevokeRoleData.role,
          newRevokeRoleData.tokenAddress,
          newRevokeRoleData.tokenId,
          newRoleAssignment.tokenAmount,
          newRevokeRoleData.grantee,
        )
    })
  })

  describe('setRoleApprovalForAll', async () => {
    it('should approve and revoke approval', async () => {
      expect(await SftRolesRegistry.isRoleApprovedForAll(AddressZero, grantor.address, anotherUser.address)).to.be.false
      expect(await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(AddressZero, anotherUser.address, true))
        .to.emit(SftRolesRegistry, 'RoleApprovalForAll')
        .withArgs(AddressZero, grantor.address, anotherUser.address, true)
      expect(await SftRolesRegistry.isRoleApprovedForAll(AddressZero, grantor.address, anotherUser.address)).to.be.true
    })
  })

  describe('withdraw', async function () {
    let RoleAssignment: RoleAssignment
    let RevokeRoleData: RevokeRoleData

    beforeEach(async () => {
      RoleAssignment = await buildRoleAssignment({
        role: 'UNIQUE_ROLE',
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
        revocable: false,
      })
      RevokeRoleData = buildRevokeRoleData(RoleAssignment)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, RoleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment)).to.not.be.reverted
    })

    it('should revert when nonce has a role is not expired', async () => {
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(RoleAssignment.grantor, RoleAssignment.nonce))
        .to.be.revertedWith('SftRolesRegistry: token has an active role')
    })

    it('should revert if nonce does not exist', async () => {
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(RevokeRoleData.grantor, generateRandomInt()))
        .to.be.revertedWith('SftRolesRegistry: nonce does not exist')
    })

    it('should not revert if nonce is expired', async () => {
      await time.increase(ONE_DAY)
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(RevokeRoleData.grantor, RevokeRoleData.nonce))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(RevokeRoleData.grantor, RevokeRoleData.nonce)
    })

    it('should not revert if nonce has a role revoked', async () => {
      await time.increase(ONE_DAY)
      await SftRolesRegistry.connect(grantor).revokeRoleFrom(
        RevokeRoleData.grantor,
        RevokeRoleData.nonce,
        RevokeRoleData.role,
        RevokeRoleData.grantee,
      )
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(RevokeRoleData.grantor, RevokeRoleData.nonce))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(RoleAssignment.grantor, RoleAssignment.nonce)
    })

    it('should not revert if nonce has a revocable role', async () => {
      await time.increase(ONE_DAY)
      RoleAssignment.revocable = true
      RoleAssignment.expirationDate = (await time.latest()) + ONE_DAY
      await SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment)
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(RevokeRoleData.grantor, RevokeRoleData.nonce))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(RevokeRoleData.grantor, RevokeRoleData.nonce)
    })
  })

  describe('View Functions', async () => {
    let RoleAssignment: RoleAssignment

    beforeEach(async () => {
      RoleAssignment = await buildRoleAssignment({
        role: 'UNIQUE_ROLE',
        tokenAddress: MockToken.address,
        grantor: grantor.address,
        grantee: grantee.address,
      })
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await MockToken.mint(grantor.address, RoleAssignment.tokenId, RoleAssignment.tokenAmount)
      await expect(SftRolesRegistry.connect(grantor).grantRoleFrom(RoleAssignment)).to.not.be.reverted
    })

    describe('RoleData', async () => {

      it('should return the role data', async () => {
        const roleData = await SftRolesRegistry.roleData(
          RoleAssignment.grantor,
          RoleAssignment.nonce,
          RoleAssignment.role,
          RoleAssignment.grantee,
        )

        expect(roleData.expirationDate).to.be.equal(RoleAssignment.expirationDate)
        expect(roleData.revocable).to.be.equal(RoleAssignment.revocable)
        expect(roleData.data).to.be.equal(RoleAssignment.data)
      })

      it('should revert if role is not UNIQUE_ROLE', async () => {
        await expect(
          SftRolesRegistry.roleData(RoleAssignment.grantor, RoleAssignment.nonce, generateRoleId('NOT_UNIQUE_ROLE'), RoleAssignment.grantee),
        ).to.be.revertedWith('SftRolesRegistry: role not supported')
      })

      it('should revert if grantee is invalid', async () => {
        await expect(
          SftRolesRegistry.roleData(RoleAssignment.grantor, RoleAssignment.nonce, RoleAssignment.role, AddressZero),
        ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
      })

    })

    describe('RoleExpirationDate', async () => {

      it('should return the expiration date', async () => {
        expect(
          await SftRolesRegistry.roleExpirationDate(
            RoleAssignment.grantor,
            RoleAssignment.nonce,
            RoleAssignment.role,
            RoleAssignment.grantee
          )
        ).to.be.equal(RoleAssignment.expirationDate)
      })

      it('should revert if role is not UNIQUE_ROLE', async () => {
        await expect(
          SftRolesRegistry.roleExpirationDate(
            RoleAssignment.grantor,
            RoleAssignment.nonce,
            generateRoleId('NOT_UNIQUE_ROLE'),
            RoleAssignment.grantee,
          ),
        ).to.be.revertedWith('SftRolesRegistry: role not supported')
      })

      it('should revert if grantee is invalid', async () => {
        await expect(
          SftRolesRegistry.roleExpirationDate(RoleAssignment.grantor, RoleAssignment.nonce, RoleAssignment.role, AddressZero),
        ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
      })

    })
  })

  describe('ERC-165 supportsInterface', async () => {
    it('should return true if ERC1155Receiver interface id', async () => {
      expect(await SftRolesRegistry.supportsInterface('0x4e2312e0')).to.be.true
    })

    it('should return true if IERCXXXX interface id', async () => {
      expect(await SftRolesRegistry.supportsInterface('0xd38a803e')).to.be.true
    })
  })
})
