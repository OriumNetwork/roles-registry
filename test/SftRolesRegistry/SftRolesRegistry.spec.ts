import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ONE_DAY, generateRoleId, buildRecord, buildGrantRole } from './helpers/mockData'
import { Record, GrantRoleData } from './types'
import { generateRandomInt } from '../helpers'
import { assertCreateRecordEvent, assertGrantRoleEvent, assertRevokeRoleEvent } from './helpers/assertEvents'

const { AddressZero } = ethers.constants

describe('SftRolesRegistry', async () => {
  let SftRolesRegistry: Contract
  let MockToken: Contract
  let grantor: SignerWithAddress
  let grantee: SignerWithAddress
  let anotherUser: SignerWithAddress

  async function deployContracts() {
    const SftRolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistry')
    SftRolesRegistry = await SftRolesRegistryFactory.deploy()
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

  describe('createRecordFrom', async () => {
    it('should revert when sender is not grantor or approved', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await expect(
        SftRolesRegistry.connect(anotherUser).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      ).to.be.revertedWith('SftRolesRegistry: account not approved')
    })

    it('should revert when tokenAmount is zero', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: 0,
      })
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      ).to.be.revertedWith('SftRolesRegistry: tokenAmount must be greater than zero')
    })

    it('should revert without a reason if tokenAddress is not an ERC-1155 contract', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAmount: generateRandomInt(),
      })
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      ).to.be.reverted
    })

    it('should revert if contract is not approved to transfer tokens', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: generateRandomInt(),
      })
      await MockToken.mint(grantor.address, record.tokenId, record.tokenAmount)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })

    it('should revert when grantor does not have enough tokens', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: generateRandomInt() + 1,
      })
      await MockToken.mint(grantor.address, record.tokenId, record.tokenAmount - 1)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      ).to.be.revertedWith('ERC1155: insufficient balance for transfer')
    })

    it('should create record when sender is grantor', async () => {
      await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1)
    })

    it('should create record when sender is approved', async () => {
      await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1, anotherUser)
    })
  })

  describe('grantRole', async () => {
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await buildGrantRole({
        recordId: 1,
        grantee: grantee.address,
      })
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: account not approved')
    })

    it('should revert when expirationDate is zero', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          await time.latest(),
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: expiration date must be in the future')
    })

    it('should revert when role is not revocable and is not expired', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.recordId, GrantRoleData.grantee, false)
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role is not expired and is not revocable')
    })

    it('should grant role when sender is grantor', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.recordId, GrantRoleData.grantee)
    })

    it('should grant role when sender is approved', async () => {
      await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.recordId,
        GrantRoleData.grantee,
        true,
        anotherUser,
      )
    })
  })

  describe('revokeRole', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: sender must be approved')
    })

    it('should revert when role assignment does not exist', async () => {
      // different recordId
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          GrantRoleData.recordId + 1,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')

      // different role
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          GrantRoleData.recordId,
          generateRoleId('ANOTHER_ROLE'),
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')

      // different grantee
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          GrantRoleData.recordId + 1,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')
    })

    it('should revert when role assignment is not expired nor revocable', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.recordId,
        grantee.address,
        false,
      )
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          roleAssignment.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role is not revocable or caller is not the approved')
    })

    it('should revoke when role is expired', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.recordId,
        grantee.address,
        false,
      )
      await time.increase(ONE_DAY)
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, roleAssignment.recordId, roleAssignment.role, grantee)
    })

    it('should revoke when role is revocable', async () => {
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, GrantRoleData.recordId, GrantRoleData.role, grantee)
    })

    it('should revoke when sender is grantee', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.recordId,
        grantee.address,
        false,
      )
      await assertRevokeRoleEvent(
        SftRolesRegistry,
        grantor,
        roleAssignment.recordId,
        roleAssignment.role,
        grantee,
        grantee,
      )
    })

    it('should revoke when sender is approved by grantee', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.recordId, grantee.address, false)
      await SftRolesRegistry.connect(grantee).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )

      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          grantee.address,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, grantee.address)
    })

    it('should revoke when sender is approved by grantor', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          grantee.address,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, grantee.address)
    })
  })

  describe('withdrawFrom', async () => {
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(SftRolesRegistry.connect(anotherUser).withdrawFrom(GrantRoleData.recordId)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert when there is an active role', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId)).to.be.revertedWith(
        'SftRolesRegistry: role is not expired and is not revocable',
      )
    })

    it('should withdraw when there are revocable roles', async () => {
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(GrantRoleData.recordId)
    })

    it('should withdraw when there are no roles', async () => {
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, GrantRoleData.recordId, GrantRoleData.role, grantee)
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(GrantRoleData.recordId)
    })

    it('should withdraw when there are expired roles', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await time.increase(ONE_DAY)
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(GrantRoleData.recordId)
    })
  })

  describe('setRoleApprovalForAll', async () => {
    it('should approve and revoke role approval for all', async () => {
      expect(await SftRolesRegistry.isRoleApprovedForAll(AddressZero, grantor.address, anotherUser.address)).to.be.false
      expect(await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(AddressZero, anotherUser.address, true))
        .to.emit(SftRolesRegistry, 'RoleApprovalForAll')
        .withArgs(AddressZero, grantor.address, anotherUser.address, true)
      expect(await SftRolesRegistry.isRoleApprovedForAll(AddressZero, grantor.address, anotherUser.address)).to.be.true
    })
  })

  describe('View Functions', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = await assertCreateRecordEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('recordInfo', async () => {
      const record = await SftRolesRegistry.recordInfo(GrantRoleData.recordId)
      expect(record.grantor_).to.be.equal(RecordCreated.grantor)
      expect(record.tokenAddress_).to.be.equal(RecordCreated.tokenAddress)
      expect(record.tokenId_).to.be.equal(RecordCreated.tokenId)
      expect(record.tokenAmount_).to.be.equal(RecordCreated.tokenAmount)
    })

    it('roleData', async () => {
      const roleData = await SftRolesRegistry.roleData(
        GrantRoleData.recordId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(roleData).to.be.equal(GrantRoleData.data)
    })

    it('roleExpirationDate', async () => {
      const roleExpirationDate = await SftRolesRegistry.roleExpirationDate(
        GrantRoleData.recordId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(roleExpirationDate).to.be.equal(GrantRoleData.expirationDate)
    })

    it('isRoleRevocable', async () => {
      const isRoleRevocable = await SftRolesRegistry.isRoleRevocable(
        GrantRoleData.recordId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(isRoleRevocable).to.be.true
    })
  })

  describe('ERC-165 supportsInterface', async () => {
    it('should return true if ERC1155Receiver interface id (0x4e2312e0)', async () => {
      expect(await SftRolesRegistry.supportsInterface('0x4e2312e0')).to.be.true
    })

    it('should return true if SftRolesRegistry interface id (0x89cb6ab6)', async () => {
      expect(await SftRolesRegistry.supportsInterface('0xf254051c')).to.be.true
    })
  })
})
