import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { generateRoleId, buildRecord, buildGrantRole } from './helpers'
import { GrantRoleData, Record } from './types'
import { generateRandomInt } from '../helpers'

describe.only('SftRolesRegistrySingleRole', async () => {
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
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await MockToken.mint(grantor.address, record.tokenId, record.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      )
        .to.emit(SftRolesRegistry, 'RecordCreated')
        .withArgs(record.grantor, 1, record.tokenAddress, record.tokenId, record.tokenAmount)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          grantor.address,
          SftRolesRegistry.address,
          record.tokenId,
          record.tokenAmount,
        )
    })

    it('should create record when sender is approved', async () => {
      const record = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await MockToken.mint(grantor.address, record.tokenId, record.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(record.tokenAddress, anotherUser.address, true)
      await expect(
        SftRolesRegistry.connect(anotherUser).createRecordFrom(
          record.grantor,
          record.tokenAddress,
          record.tokenId,
          record.tokenAmount,
        ),
      )
        .to.emit(SftRolesRegistry, 'RecordCreated')
        .withArgs(record.grantor, 1, record.tokenAddress, record.tokenId, record.tokenAmount)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          grantor.address,
          SftRolesRegistry.address,
          record.tokenId,
          record.tokenAmount,
        )
    })
  })

  describe('grantRole', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        recordId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, RecordCreated.tokenId, RecordCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          RecordCreated.grantor,
          RecordCreated.tokenAddress,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        ),
      ).to.not.be.reverted
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

    it('should revert when role is not supported', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          generateRoleId('ANOTHER_ROLE'),
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role not supported')
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

    it('should grant role when sender is grantor', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        )
    })

    it('should grant role when sender is approved', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        )
    })
  })

  describe('revokeRole', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        recordId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, RecordCreated.tokenId, RecordCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          RecordCreated.grantor,
          RecordCreated.tokenAddress,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          grantee.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: sender must be approved')
    })

    it('should revert when the grantee is not the same', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
    })

    it('should revert when role is not expired and is not revocable', async () => {
      const newRecordId = 2
      await MockToken.mint(grantor.address, RecordCreated.tokenId, RecordCreated.tokenAmount)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          RecordCreated.grantor,
          RecordCreated.tokenAddress,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          newRecordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          false,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(newRecordId, GrantRoleData.role, GrantRoleData.grantee),
      ).to.be.revertedWith('SftRolesRegistry: role is not expired and is not revocable')
    })

    it('should revoke role when sender is grantee, and role is not expired nor revocable', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          false,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted

      await expect(
        SftRolesRegistry.connect(grantee).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is grantor', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is grantee', async () => {
      await expect(
        SftRolesRegistry.connect(grantee).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is approved by grantor', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is approved by grantee', async () => {
      await SftRolesRegistry.connect(grantee).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRoleFrom(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.recordId, GrantRoleData.role, GrantRoleData.grantee)
    })
  })

  describe('withdrawFrom', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        recordId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, RecordCreated.tokenId, RecordCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          RecordCreated.grantor,
          RecordCreated.tokenAddress,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        ),
      ).to.not.be.reverted
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(SftRolesRegistry.connect(anotherUser).withdrawFrom(GrantRoleData.recordId)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert when record has an active role', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId)).to.be.revertedWith(
        'SftRolesRegistry: token has an active role',
      )
    })

    it('should withdraw tokens when sender is grantor', async () => {
      await expect(SftRolesRegistry.connect(grantor).withdrawFrom(GrantRoleData.recordId))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(GrantRoleData.recordId)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          grantor.address,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        )
    })

    it('should withdraw tokens when sender is approved', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        RecordCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(SftRolesRegistry.connect(anotherUser).withdrawFrom(GrantRoleData.recordId))
        .to.emit(SftRolesRegistry, 'Withdrew')
        .withArgs(GrantRoleData.recordId)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          grantor.address,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        )
    })
  })

  describe('view functions', async () => {
    let RecordCreated: Record
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      RecordCreated = buildRecord({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        recordId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, RecordCreated.tokenId, RecordCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).createRecordFrom(
          RecordCreated.grantor,
          RecordCreated.tokenAddress,
          RecordCreated.tokenId,
          RecordCreated.tokenAmount,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
    })

    it('should revert when grantee is not the same', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).roleData(GrantRoleData.recordId, GrantRoleData.role, anotherUser.address),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
      await expect(
        SftRolesRegistry.connect(grantor).roleExpirationDate(
          GrantRoleData.recordId,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
    })

    it('should return role data', async () => {
      expect(
        await SftRolesRegistry.connect(grantor).roleExpirationDate(
          GrantRoleData.recordId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(GrantRoleData.expirationDate)

      const roleDate = await SftRolesRegistry.connect(grantor).roleData(
        GrantRoleData.recordId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(roleDate.grantee).to.be.equal(GrantRoleData.grantee)
      expect(roleDate.expirationDate).to.be.equal(GrantRoleData.expirationDate)
      expect(roleDate.revocable).to.be.equal(GrantRoleData.revocable)
      expect(roleDate.data).to.be.equal(GrantRoleData.data)
    })
  })

  describe('ERC-165 supportsInterface', async () => {
    it('should return true if ERC1155Receiver interface id', async () => {
      expect(await SftRolesRegistry.supportsInterface('0x4e2312e0')).to.be.true
    })

    it('should return true if IERCXXXX interface id', async () => {
      expect(await SftRolesRegistry.supportsInterface('0xa4629326')).to.be.true
    })
  })
})
