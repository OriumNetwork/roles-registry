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
  getRoleBalanceOfInterfaceId,
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

  describe('releaseTokens', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = await assertCreateCommitmentEvent(SftRolesRegistry, MockToken, grantor, 1)
      GrantRoleData = await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address)
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(SftRolesRegistry.connect(anotherUser).releaseTokens(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert when there is an active role', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await expect(SftRolesRegistry.connect(grantor).releaseTokens(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: commitment has an active non-revocable role',
      )
    })

    it('should release when there are two revocable roles', async () => {

      await assertGrantRoleEvent(
        SftRolesRegistry, grantor, 1, grantee.address, true, grantor, 'ANOTHER_ROLE'
      )

      await expect(SftRolesRegistry.connect(grantor).releaseTokens(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'TokensReleased')
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

    it('should release when there are no roles', async () => {
      await assertRevokeRoleEvent(SftRolesRegistry, grantor, GrantRoleData.commitmentId, GrantRoleData.role, grantee)
      await expect(SftRolesRegistry.connect(grantor).releaseTokens(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'TokensReleased')
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

    it('should release when there are expired roles', async () => {
      await assertGrantRoleEvent(SftRolesRegistry, grantor, 1, grantee.address, false)
      await time.increase(ONE_DAY)
      await expect(SftRolesRegistry.connect(grantor).releaseTokens(GrantRoleData.commitmentId))
        .to.emit(SftRolesRegistry, 'TokensReleased')
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

  describe('roleBalanceOf', async () => {
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
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
    })

    it('should return balance zero if grantee has no roles', async () => {
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(0)
    })

    it('should add balance to three grantees', async () => {
      const roles = [grantee.address, anotherUser.address, grantor.address].map(g => ({
        grantee: g,
        tokenAmount: generateRandomInt(),
      }))

      const totalTokenAmount = roles.map(r => r.tokenAmount).reduce((a, b) => a + b, 0)
      await MockToken.connect(grantor).mint(grantor.address, CommitmentCreated.tokenId, totalTokenAmount)

      for (const role of roles) {
        // make sure initial balance of grantee is zero
        expect(
          await SftRolesRegistry.roleBalanceOf(
            GrantRoleData.role,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.grantee,
          ),
        ).to.be.equal(0)

        // grant role
        await expect(
          SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
            CommitmentCreated.grantor,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.tokenAmount,
            GrantRoleData.role,
            role.grantee,
            GrantRoleData.expirationDate,
            GrantRoleData.revocable,
            GrantRoleData.data,
          ),
        ).to.not.be.reverted

        // confirm that the balance increased
        expect(
          await SftRolesRegistry.roleBalanceOf(
            GrantRoleData.role,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.grantee,
          ),
        ).to.be.equal(role.tokenAmount)
      }
    })

    it('should grant 10 roles, then revoke them, release and wait for them to expire', async () => {
      const currentDate = await time.latest()
      const roles = Array(10)
        .fill(0)
        .map((v, index) => ({
          tokenAmount: generateRandomInt(),
          expirationDate: currentDate + (index + 1) * ONE_DAY,
        }))
      const totalTokenAmount = roles.map(r => r.tokenAmount).reduce((a, b) => a + b, 0)
      await MockToken.connect(grantor).mint(grantor.address, CommitmentCreated.tokenId, totalTokenAmount)

      // make sure initial balance of grantee is zero
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(0)

      for (const role of roles) {
        await expect(
          SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
            CommitmentCreated.grantor,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.tokenAmount,
            GrantRoleData.role,
            GrantRoleData.grantee,
            role.expirationDate,
            GrantRoleData.revocable,
            GrantRoleData.data,
          ),
        ).to.not.be.reverted
      }

      // check if correctly summed tokenAmount
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(totalTokenAmount)

      // revoke the first role
      await expect(SftRolesRegistry.connect(grantor).revokeRole(1, GrantRoleData.role, GrantRoleData.grantee)).to.not.be
        .reverted

      // revoke the last role
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(roles.length, GrantRoleData.role, GrantRoleData.grantee),
      ).to.not.be.reverted

      // check if correctly summed leftovers
      let leftoverTokenAmount = roles
        .slice(1, roles.length - 1)
        .map(r => r.tokenAmount)
        .reduce((a, b) => a + b, 0)

      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(leftoverTokenAmount)

      // expire second and third role
      leftoverTokenAmount = roles
        .slice(3, roles.length - 1)
        .map(r => r.tokenAmount)
        .reduce((a, b) => a + b, 0)

      await time.increase(ONE_DAY * 3)
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(leftoverTokenAmount)

      // release commitment
      for (let i = 1; i < roles.length + 1; i++) {
        await expect(SftRolesRegistry.connect(grantor).releaseTokens(i)).to.not.be.reverted
      }
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(0)
    })

    it('should grant 1,000 roles and sum them up @skip-on-coverage', async () => {
      const currentDate = await time.latest()
      const roles = Array(1000)
        .fill(0)
        .map((v, index) => ({
          tokenAmount: generateRandomInt(),
          expirationDate: currentDate + (1000 - index) * ONE_DAY,
        }))
      const totalTokenAmount = roles.map(r => r.tokenAmount).reduce((a, b) => a + b, 0)
      await MockToken.connect(grantor).mint(grantor.address, CommitmentCreated.tokenId, totalTokenAmount)

      for (const role of roles) {
        await expect(
          SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
            CommitmentCreated.grantor,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.tokenAmount,
            GrantRoleData.role,
            GrantRoleData.grantee,
            role.expirationDate,
            GrantRoleData.revocable,
            GrantRoleData.data,
          ),
        ).to.not.be.reverted
      }

      // check if correctly summed tokenAmount
      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(totalTokenAmount)
    })

    it('should grant three roles inserting the last one in the middle of the list', async () => {
      const currentDate = await time.latest()
      const roles = [currentDate + ONE_DAY, currentDate + 3 * ONE_DAY, currentDate + 2 * ONE_DAY].map(
        expirationDate => ({ expirationDate, tokenAmount: generateRandomInt() }),
      )
      const totalTokenAmount = roles.map(r => r.tokenAmount).reduce((a, b) => a + b, 0)
      await MockToken.connect(grantor).mint(grantor.address, CommitmentCreated.tokenId, totalTokenAmount)

      for (const role of roles) {
        await expect(
          SftRolesRegistry.connect(grantor).commitTokensAndGrantRole(
            CommitmentCreated.grantor,
            CommitmentCreated.tokenAddress,
            CommitmentCreated.tokenId,
            role.tokenAmount,
            GrantRoleData.role,
            GrantRoleData.grantee,
            role.expirationDate,
            GrantRoleData.revocable,
            GrantRoleData.data,
          ),
        ).to.not.be.reverted
      }

      expect(
        await SftRolesRegistry.roleBalanceOf(
          GrantRoleData.role,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(totalTokenAmount)
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

    it('should return true if IRoleBalanceOfExtension interface id', async () => {
      const interfaceId = getRoleBalanceOfInterfaceId()
      expect(await SftRolesRegistry.supportsInterface(interfaceId)).to.be.true
    })
  })
})
