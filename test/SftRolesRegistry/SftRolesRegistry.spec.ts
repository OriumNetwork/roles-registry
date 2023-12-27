import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Commitment, GrantRoleData } from './types'
import { generateRandomInt } from '../helpers'
import { assertCreateCommitmentEvent, assertGrantRoleEvent, assertRevokeRoleEvent } from './helpers/assertEvents'
import {
  ONE_DAY,
  generateRoleId,
  buildCommitment,
  buildGrantRole,
  getSftRolesRegistryInterfaceId,
  getCommitTokensAndGrantRoleInterfaceId,
} from './helpers/mockData'

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

  describe('commitTokens', async () => {
    it('should revert when sender is not grantor or approved', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await expect(
        SftRolesRegistry.connect(anotherUser).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      ).to.be.revertedWith('SftRolesRegistry: account not approved')
    })

    it('should revert when tokenAmount is zero', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: 0,
      })
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      ).to.be.revertedWith('SftRolesRegistry: tokenAmount must be greater than zero')
    })

    it('should revert without a reason if tokenAddress is not an ERC-1155 contract', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAmount: generateRandomInt(),
      })
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      ).to.be.reverted
    })

    it('should revert if contract is not approved to transfer tokens', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: generateRandomInt(),
      })
      await MockToken.mint(grantor.address, commitment.tokenId, commitment.tokenAmount)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })

    it('should revert when grantor does not have enough tokens', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
        tokenAmount: generateRandomInt() + 1,
      })
      await MockToken.mint(grantor.address, commitment.tokenId, commitment.tokenAmount - 1)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      ).to.be.revertedWith('ERC1155: insufficient balance for transfer')
    })

    it('should create commitment when sender is grantor', async () => {
      await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
    })

    it('should create commitment when sender is approved', async () => {
      await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1, anotherUser)
    })
  })

  describe('grantRole', async () => {
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await buildGrantRole({
        commitmentId: 1,
        grantee: grantee.address,
      })
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).grantRole(
          GrantRoleData.commitmentId,
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
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          await time.latest(),
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: expiration date must be in the future')
    })

    it('should revert when role is not revocable and is not expired', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, GrantRoleData.grantee, false)
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role is not expired and is not revocable')
    })

    it('should grant role when sender is grantor', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, GrantRoleData.grantee)
    })

    it('should grant role when sender is approved', async () => {
      await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.commitmentId,
        GrantRoleData.grantee,
        true,
        anotherUser,
      )
    })
  })

  describe('revokeRole', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: sender must be approved')
    })

    it('should revert when role assignment does not exist', async () => {
      // different commitmentId
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          GrantRoleData.commitmentId + 1,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')

      // different role
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          GrantRoleData.commitmentId,
          generateRoleId('ANOTHER_ROLE'),
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')

      // different grantee
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          GrantRoleData.commitmentId + 1,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: could not find role assignment')
    })

    it('should revert when role assignment is not expired nor revocable', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.commitmentId,
        grantee.address,
        false,
      )
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          roleAssignment.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.revertedWith('SftRolesRegistry: role is not revocable or caller is not the approved')
    })

    it('should revoke when role is expired', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.commitmentId,
        grantee.address,
        false,
      )
      await time.increase(ONE_DAY)
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, roleAssignment.commitmentId, roleAssignment.role, grantee)
    })

    it('should revoke when role is revocable', async () => {
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, GrantRoleData.role, grantee)
    })

    it('should revoke when sender is grantee, and role is not expired nor revocable', async () => {
      const roleAssignment = await assertGrantRoleEvent(
        SftRolesRegistry,
        grantor,
        GrantRoleData.commitmentId,
        grantee.address,
        false,
      )
      await assertRevokeRoleEvent(
        SftRolesRegistry,
        grantor,
        roleAssignment.commitmentId,
        roleAssignment.role,
        grantee,
        grantee,
      )
    })

    it('should revoke when sender is approved by grantee', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, grantee.address, false)
      await SftRolesRegistry.connect(grantee).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )

      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          grantee.address,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, grantee.address)
    })

    it('should revoke when sender is approved by grantor', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          grantee.address,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, grantee.address)
    })
  })

  describe('withdrawNfts', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(SftRolesRegistry.connect(anotherUser).withdrawNfts(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert when there is an active role', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await expect(SftRolesRegistry.connect(grantor).withdrawNfts(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: commitment has an active non-revocable role',
      )
    })

    it('should withdraw when there are revocable roles', async () => {
      await expect(SftRolesRegistry.connect(grantor).withdrawNfts(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'NftsWithdrawn')
        .withArgs(GrantRoleData.commitmentId)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          grantor.address,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        )
    })

    it('should withdraw when there are no roles', async () => {
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, GrantRoleData.role, grantee)
      await expect(SftRolesRegistry.connect(grantor).withdrawNfts(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'NftsWithdrawn')
        .withArgs(GrantRoleData.commitmentId)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          grantor.address,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        )
    })

    it('should withdraw when there are expired roles', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await time.increase(ONE_DAY)
      await expect(SftRolesRegistry.connect(grantor).withdrawNfts(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'NftsWithdrawn')
        .withArgs(GrantRoleData.commitmentId)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          SftRolesRegistry.address,
          grantor.address,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        )
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

  describe('commitTokensAndGrantRole', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        commitmentId: 1,
      })
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(
        SftRolesRegistry.connect(anotherUser).commitTokensAndGrantRole(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: account not approved')
    })

    it('should revert when tokenAmount is zero', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          0,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: tokenAmount must be greater than zero')
    })

    it('should revert when expirationDate is not in the future', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
          GrantRoleData.role,
          GrantRoleData.grantee,
          await time.latest(),
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.be.revertedWith('SftRolesRegistry: expiration date must be in the future')
    })

    it('should commit tokens and grant role', async () => {
      await MockToken.mint(grantor.address, CommitmentCreated.tokenId, CommitmentCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      )
        .to.emit(SftRolesRegistry, 'TokensCommitted')
        .withArgs(
          CommitmentCreated.grantor,
          GrantRoleData.commitmentId,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        )
        .to.emit(SftRolesRegistry, 'RoleGranted')
        .withArgs(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        )
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          CommitmentCreated.grantor,
          SftRolesRegistry.address,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        )
    })
  })

  describe('View Functions', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('grantorOf', async () => {
      expect(await SftRolesRegistry.grantorOf(GrantRoleData.commitmentId)).to.be.equal(CommitmentCreated.grantor)
    })

    it('tokenAddressOf', async () => {
      expect(await SftRolesRegistry.tokenAddressOf(GrantRoleData.commitmentId)).to.be.equal(
        CommitmentCreated.tokenAddress,
      )
    })

    it('tokenIdOf', async () => {
      expect(await SftRolesRegistry.tokenIdOf(GrantRoleData.commitmentId)).to.be.equal(CommitmentCreated.tokenId)
    })

    it('tokenAmountOf', async () => {
      expect(await SftRolesRegistry.tokenAmountOf(GrantRoleData.commitmentId)).to.be.equal(
        CommitmentCreated.tokenAmount,
      )
    })

    it('roleData', async () => {
      const roleData = await SftRolesRegistry.roleData(
        GrantRoleData.commitmentId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(roleData).to.be.equal(GrantRoleData.data)
    })

    it('roleExpirationDate', async () => {
      const roleExpirationDate = await SftRolesRegistry.roleExpirationDate(
        GrantRoleData.commitmentId,
        GrantRoleData.role,
        GrantRoleData.grantee,
      )
      expect(roleExpirationDate).to.be.equal(GrantRoleData.expirationDate)
    })

    it('isRoleRevocable', async () => {
      const isRoleRevocable = await SftRolesRegistry.isRoleRevocable(
        GrantRoleData.commitmentId,
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

    it('should return true if SftRolesRegistry interface id', async () => {
      const interfaceId = getSftRolesRegistryInterfaceId()
      expect(await SftRolesRegistry.supportsInterface(interfaceId)).to.be.true
    })

    it('should return true if ICommitTokensAndGrantRoleExtension interface id', async () => {
      const interfaceId = getCommitTokensAndGrantRoleInterfaceId()
      expect(await SftRolesRegistry.supportsInterface(interfaceId)).to.be.true
    })
  })
})
