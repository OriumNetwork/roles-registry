import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { generateRoleId, buildCommitment, buildGrantRole, getSftRolesRegistryInterfaceId } from './helpers/mockData'
import { GrantRoleData, Commitment } from './types'
import { generateRandomInt } from '../helpers'
import { assertCreateCommitmentEvent, assertGrantRoleEvent } from './helpers/assertEvents'

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
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await MockToken.mint(grantor.address, commitment.tokenId, commitment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      )
        .to.emit(SftRolesRegistry, 'TokensCommitted')
        .withArgs(commitment.grantor, 1, commitment.tokenAddress, commitment.tokenId, commitment.tokenAmount)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          grantor.address,
          SftRolesRegistry.address,
          commitment.tokenId,
          commitment.tokenAmount,
        )
    })

    it('should create commitment when sender is approved', async () => {
      const commitment = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      await MockToken.mint(grantor.address, commitment.tokenId, commitment.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(commitment.tokenAddress, anotherUser.address, true)
      await expect(
        SftRolesRegistry.connect(anotherUser).commitTokens(
          commitment.grantor,
          commitment.tokenAddress,
          commitment.tokenId,
          commitment.tokenAmount,
        ),
      )
        .to.emit(SftRolesRegistry, 'TokensCommitted')
        .withArgs(commitment.grantor, 1, commitment.tokenAddress, commitment.tokenId, commitment.tokenAmount)
        .to.emit(MockToken, 'TransferSingle')
        .withArgs(
          SftRolesRegistry.address,
          grantor.address,
          SftRolesRegistry.address,
          commitment.tokenId,
          commitment.tokenAmount,
        )
    })
  })

  describe('grantRole', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        commitmentId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, CommitmentCreated.tokenId, CommitmentCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        ),
      ).to.not.be.reverted
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

    it('should revert when role is not supported', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.commitmentId,
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
          GrantRoleData.commitmentId,
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
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
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
    })

    it('should grant role when sender is approved', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).grantRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
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
    })
  })

  describe('revokeRole', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        commitmentId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, CommitmentCreated.tokenId, CommitmentCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.commitmentId,
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
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          grantee.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: sender must be approved')
    })

    it('should revert when the grantee is not the same', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
    })

    it('should revert when role is not expired and is not revocable', async () => {
      const newcommitmentId = 2
      await MockToken.mint(grantor.address, CommitmentCreated.tokenId, CommitmentCreated.tokenAmount)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          newcommitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          false,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(newcommitmentId, GrantRoleData.role, GrantRoleData.grantee),
      ).to.be.revertedWith('SftRolesRegistry: role is not expired and is not revocable')
    })

    it('should revoke role when sender is grantee, and role is not expired nor revocable', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          false,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted

      await expect(
        SftRolesRegistry.connect(grantee).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is grantor', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is grantee', async () => {
      await expect(
        SftRolesRegistry.connect(grantee).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is approved by grantor', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, GrantRoleData.grantee)
    })

    it('should revoke role when sender is approved by grantee', async () => {
      await SftRolesRegistry.connect(grantee).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        SftRolesRegistry.connect(anotherUser).revokeRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      )
        .to.emit(SftRolesRegistry, 'RoleRevoked')
        .withArgs(GrantRoleData.commitmentId, GrantRoleData.role, GrantRoleData.grantee)
    })
  })

  describe('withdrawNfts', async () => {
    let CommitmentCreated: Commitment
    let GrantRoleData: GrantRoleData

    beforeEach(async () => {
      CommitmentCreated = buildCommitment({
        grantor: grantor.address,
        tokenAddress: MockToken.address,
      })
      GrantRoleData = await buildGrantRole({
        commitmentId: 1,
        grantee: grantee.address,
      })
      await MockToken.mint(grantor.address, CommitmentCreated.tokenId, CommitmentCreated.tokenAmount)
      await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)
      await expect(
        SftRolesRegistry.connect(grantor).commitTokens(
          CommitmentCreated.grantor,
          CommitmentCreated.tokenAddress,
          CommitmentCreated.tokenId,
          CommitmentCreated.tokenAmount,
        ),
      ).to.not.be.reverted
    })

    it('should revert when sender is not grantor or approved', async () => {
      await expect(SftRolesRegistry.connect(anotherUser).withdrawNfts(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: account not approved',
      )
    })

    it('should revert when commitment has an active role', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).grantRole(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
          GrantRoleData.expirationDate,
          GrantRoleData.revocable,
          GrantRoleData.data,
        ),
      ).to.not.be.reverted
      await expect(SftRolesRegistry.connect(grantor).withdrawNfts(GrantRoleData.commitmentId)).to.be.revertedWith(
        'SftRolesRegistry: token has an active role',
      )
    })

    it('should withdrawNfts tokens when sender is grantor', async () => {
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

    it('should withdrawNfts tokens when sender is approved', async () => {
      await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(
        CommitmentCreated.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(SftRolesRegistry.connect(anotherUser).withdrawNfts(GrantRoleData.commitmentId))
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

  describe('view functions', async () => {
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

    it('should revert when grantee is not the same', async () => {
      await expect(
        SftRolesRegistry.connect(grantor).roleData(GrantRoleData.commitmentId, GrantRoleData.role, anotherUser.address),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')

      await expect(
        SftRolesRegistry.connect(grantor).roleExpirationDate(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')

      await expect(
        SftRolesRegistry.connect(grantor).isRoleRevocable(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          anotherUser.address,
        ),
      ).to.be.revertedWith('SftRolesRegistry: grantee mismatch')
    })

    it('should return role data', async () => {
      expect(
        await SftRolesRegistry.connect(grantor).roleExpirationDate(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(GrantRoleData.expirationDate)

      expect(
        await SftRolesRegistry.connect(grantor).roleData(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(GrantRoleData.data)

      expect(
        await SftRolesRegistry.connect(grantor).isRoleRevocable(
          GrantRoleData.commitmentId,
          GrantRoleData.role,
          GrantRoleData.grantee,
        ),
      ).to.be.equal(GrantRoleData.revocable)
    })
  })

  describe('ERC-165 supportsInterface', async () => {
    it('should return true if ERC1155Receiver interface id', async () => {
      expect(await SftRolesRegistry.supportsInterface('0x4e2312e0')).to.be.true
    })

    it('should return true if SftRolesRegistry interface id', async () => {
      const interfaceId = getSftRolesRegistryInterfaceId()
      expect(await SftRolesRegistry.supportsInterface(interfaceId)).to.be.true
    })
  })
})
