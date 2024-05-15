import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { beforeEach } from 'mocha'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { Role } from '../types'
import { buildRole, getExpiredDate } from './mockData'
import { expect } from 'chai'
import { IERC7432__factory, IERC721Receiver__factory } from '../../typechain-types'
import { generateErc165InterfaceId, ONE_DAY } from '../helpers'

const { AddressZero, HashZero } = ethers.constants

describe('ERC7432ImmutableRegistry', () => {
  let ERC7432ImmutableRegistry: Contract
  let MockErc721Token: Contract
  let owner: SignerWithAddress
  let recipient: SignerWithAddress
  let anotherUser: SignerWithAddress
  let role: Role

  async function deployContracts() {
    const SftRolesRegistryFactory = await ethers.getContractFactory('ERC7432ImmutableRegistry')
    ERC7432ImmutableRegistry = await SftRolesRegistryFactory.deploy()
    const MockErc721TokenFactory = await ethers.getContractFactory('MockERC721')
    MockErc721Token = await MockErc721TokenFactory.deploy()
    const signers = await ethers.getSigners()
    owner = signers[0]
    recipient = signers[1]
    anotherUser = signers[2]
  }

  async function depositNftAndGrantRole({ recipient = role.recipient, revocable = role.revocable }) {
    await MockErc721Token.approve(ERC7432ImmutableRegistry.address, role.tokenId)
    await expect(ERC7432ImmutableRegistry.grantRole({ ...role, recipient, revocable }))
      .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
      .withArgs(
        role.tokenAddress,
        role.tokenId,
        role.roleId,
        owner.address,
        recipient,
        role.expirationDate,
        revocable,
        role.data,
      )
      .to.emit(MockErc721Token, 'Transfer')
      .withArgs(owner.address, ERC7432ImmutableRegistry.address, role.tokenId)
      .to.emit(ERC7432ImmutableRegistry, 'TokenLocked')
      .withArgs(owner.address, role.tokenAddress, role.tokenId)
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
    role = await buildRole({
      tokenAddress: MockErc721Token.address,
    })
    MockErc721Token.mint(owner.address, role.tokenId)
  })

  describe('grantRole', () => {
    it('should revert when expiration date is in the past', async () => {
      const expirationDate = await getExpiredDate()
      const role = await buildRole({ expirationDate })
      await expect(ERC7432ImmutableRegistry.connect(owner).grantRole(role)).to.be.revertedWith(
        'ERC7432ImmutableRegistry: expiration date must be in the future',
      )
    })

    it('should revert when tokenAddress is not an ERC-721', async () => {
      const role = await buildRole({})
      await expect(ERC7432ImmutableRegistry.connect(owner).grantRole(role)).to.be.reverted
    })

    describe('when NFT is not deposited', () => {
      it('should revert when sender is not approved or owner', async () => {
        await expect(ERC7432ImmutableRegistry.connect(recipient).grantRole(role)).to.be.revertedWith(
          'ERC7432ImmutableRegistry: sender must be owner or approved',
        )
      })

      it('should revert when contract is not approved to transfer NFT', async () => {
        await expect(ERC7432ImmutableRegistry.connect(owner).grantRole(role)).to.be.revertedWith(
          'ERC721: caller is not token owner or approved',
        )
      })

      it('should revert when sender is role approved, but contract is not approved to transfer NFT', async () => {
        await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(ERC7432ImmutableRegistry.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC721: caller is not token owner or approved',
        )
      })

      it('should grant role when sender is NFT owner', async () => {
        await depositNftAndGrantRole({})
      })

      it('should grant role when sender is approved', async () => {
        await MockErc721Token.connect(owner).approve(ERC7432ImmutableRegistry.address, role.tokenId)
        await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(ERC7432ImmutableRegistry.connect(anotherUser).grantRole(role))
          .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
          .withArgs(
            role.tokenAddress,
            role.tokenId,
            role.roleId,
            owner.address,
            role.recipient,
            role.expirationDate,
            role.revocable,
            role.data,
          )
          .to.emit(MockErc721Token, 'Transfer')
          .withArgs(owner.address, ERC7432ImmutableRegistry.address, role.tokenId)
          .to.emit(ERC7432ImmutableRegistry, 'TokenLocked')
          .withArgs(owner.address, role.tokenAddress, role.tokenId)
      })
    })

    describe('when NFT is deposited', () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({})
      })

      it('should revert when sender is not approved nor original owner', async () => {
        await expect(ERC7432ImmutableRegistry.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC7432ImmutableRegistry: sender must be owner or approved',
        )
      })

      it('should grant role when sender is original owner', async () => {
        await expect(ERC7432ImmutableRegistry.connect(owner).grantRole(role))
          .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
          .withArgs(
            role.tokenAddress,
            role.tokenId,
            role.roleId,
            owner.address,
            role.recipient,
            role.expirationDate,
            role.revocable,
            role.data,
          )
          .to.not.emit(MockErc721Token, 'Transfer')
          .to.not.emit(ERC7432ImmutableRegistry, 'TokenLocked')
      })

      it('should grant role when sender is approved', async () => {
        await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(ERC7432ImmutableRegistry.connect(anotherUser).grantRole(role))
          .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
          .withArgs(
            role.tokenAddress,
            role.tokenId,
            role.roleId,
            owner.address,
            role.recipient,
            role.expirationDate,
            role.revocable,
            role.data,
          )
          .to.not.emit(MockErc721Token, 'Transfer')
          .to.not.emit(ERC7432ImmutableRegistry, 'TokenLocked')
      })

      it('should revert when there is a non-expired and non-revocable role', async () => {
        await ERC7432ImmutableRegistry.connect(owner).grantRole({ ...role, revocable: false })
        await expect(ERC7432ImmutableRegistry.connect(owner).grantRole(role)).to.be.revertedWith(
          'ERC7432ImmutableRegistry: non-revocable role is not expired',
        )
      })
    })
  })

  describe('revokeRole', () => {
    beforeEach(async () => {
      await depositNftAndGrantRole({ recipient: recipient.address })
    })

    it('should revert when role does not exist', async () => {
      await expect(
        ERC7432ImmutableRegistry.revokeRole(role.tokenAddress, role.tokenId + 1, role.roleId),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: role does not exist')
    })

    it('should revert when sender is not owner, recipient or approved', async () => {
      await expect(
        ERC7432ImmutableRegistry.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: sender is not approved')
    })

    it('should revert when sender is owner but role is not revocable nor expired', async () => {
      await expect(ERC7432ImmutableRegistry.connect(owner).grantRole({ ...role, revocable: false }))

      await expect(
        ERC7432ImmutableRegistry.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: role is not revocable nor expired')
    })

    it('should revoke role when sender is recipient', async () => {
      await expect(ERC7432ImmutableRegistry.connect(recipient).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved by recipient', async () => {
      await ERC7432ImmutableRegistry.connect(recipient).setRoleApprovalForAll(
        role.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        ERC7432ImmutableRegistry.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is owner (and role is revocable)', async () => {
      await expect(ERC7432ImmutableRegistry.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is owner, and role is not revocable but is expired', async () => {
      await expect(ERC7432ImmutableRegistry.connect(owner).grantRole({ ...role, revocable: false }))
        .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          owner.address,
          role.recipient,
          role.expirationDate,
          false,
          role.data,
        )
        .to.not.emit(MockErc721Token, 'Transfer')
        .to.not.emit(ERC7432ImmutableRegistry, 'TokenLocked')

      await time.increase(ONE_DAY)
      await expect(ERC7432ImmutableRegistry.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved by owner (and role is revocable)', async () => {
      await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(
        ERC7432ImmutableRegistry.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved both by owner and recipient, and role not revocable', async () => {
      await expect(
        ERC7432ImmutableRegistry.connect(owner).grantRole({
          ...role,
          recipient: recipient.address,
          revocable: false,
        }),
      )
      await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await ERC7432ImmutableRegistry.connect(recipient).setRoleApprovalForAll(
        role.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        ERC7432ImmutableRegistry.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should not delete original owner when revoking role', async () => {
      await expect(ERC7432ImmutableRegistry.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)

      expect(await ERC7432ImmutableRegistry.originalOwners(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
    })

    it('should revert if role was already revoked', async () => {
      await expect(ERC7432ImmutableRegistry.revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432ImmutableRegistry, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)

      await expect(
        ERC7432ImmutableRegistry.revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: role does not exist')
    })
  })

  describe('unlockToken', () => {
    beforeEach(async () => {
      await depositNftAndGrantRole({ recipient: recipient.address })
    })

    it('should revert if token is not deposited', async () => {
      await expect(
        ERC7432ImmutableRegistry.connect(owner).unlockToken(role.tokenAddress, role.tokenId + 1),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: sender must be owner or approved')
    })

    it('should revert if sender is not original owner or approved', async () => {
      await expect(
        ERC7432ImmutableRegistry.connect(anotherUser).unlockToken(role.tokenAddress, role.tokenId),
      ).to.be.revertedWith('ERC7432ImmutableRegistry: sender must be owner or approved')
    })

    it('should revert if NFT is locked', async () => {
      const revocable = false
      await expect(ERC7432ImmutableRegistry.grantRole({ ...role, revocable }))
        .to.emit(ERC7432ImmutableRegistry, 'RoleGranted')
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          owner.address,
          role.recipient,
          role.expirationDate,
          revocable,
          role.data,
        )
        .to.not.emit(MockErc721Token, 'Transfer')
        .to.not.emit(ERC7432ImmutableRegistry, 'TokenLocked')

      await expect(ERC7432ImmutableRegistry.unlockToken(role.tokenAddress, role.tokenId)).to.be.revertedWith(
        'ERC7432ImmutableRegistry: NFT is locked',
      )
    })

    it('should unlock token if sender is owner and NFT is not locked', async () => {
      await expect(ERC7432ImmutableRegistry.connect(owner).unlockToken(role.tokenAddress, role.tokenId))
        .to.emit(ERC7432ImmutableRegistry, 'TokenUnlocked')
        .withArgs(owner.address, role.tokenAddress, role.tokenId)
        .to.emit(MockErc721Token, 'Transfer')
        .withArgs(ERC7432ImmutableRegistry.address, owner.address, role.tokenId)
    })

    it('should unlock token if sender is approved and NFT is not locked', async () => {
      await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(ERC7432ImmutableRegistry.connect(anotherUser).unlockToken(role.tokenAddress, role.tokenId))
        .to.emit(ERC7432ImmutableRegistry, 'TokenUnlocked')
        .withArgs(owner.address, role.tokenAddress, role.tokenId)
        .to.emit(MockErc721Token, 'Transfer')
        .withArgs(ERC7432ImmutableRegistry.address, owner.address, role.tokenId)
    })
  })

  describe('view functions', async () => {
    describe('when NFT is not deposited', async () => {
      it('recipientOf should return default value', async () => {
        expect(await ERC7432ImmutableRegistry.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          AddressZero,
        )
      })

      it('roleData should return default value', async () => {
        expect(await ERC7432ImmutableRegistry.roleData(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal('0x')
      })

      it('roleExpirationDate should return default value', async () => {
        expect(
          await ERC7432ImmutableRegistry.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(0)
      })

      it('isRoleRevocable should return default value', async () => {
        expect(await ERC7432ImmutableRegistry.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.false
      })
    })

    describe('when NFT is deposited', async () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({ recipient: recipient.address })
      })

      it('ownerOf should return value from mapping', async () => {
        expect(await ERC7432ImmutableRegistry.ownerOf(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
      })

      it('recipientOf should return value from mapping', async () => {
        expect(await ERC7432ImmutableRegistry.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          recipient.address,
        )
      })

      it('roleData should return the custom data of the role', async () => {
        expect(await ERC7432ImmutableRegistry.roleData(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          HashZero,
        )
      })

      it('roleExpirationDate should the expiration date of the role', async () => {
        expect(
          await ERC7432ImmutableRegistry.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(role.expirationDate)
      })

      it('isRoleRevocable should whether the role is revocable', async () => {
        expect(await ERC7432ImmutableRegistry.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.true
      })
    })
  })

  describe('isRoleApprovedForAll', async () => {
    it('should return false when not approved', async () => {
      expect(await ERC7432ImmutableRegistry.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address))
        .to.be.false
    })

    it('should return true when approved', async () => {
      await ERC7432ImmutableRegistry.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      expect(await ERC7432ImmutableRegistry.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address))
        .to.be.true
    })
  })

  describe('ERC-165', async () => {
    it('should return true when IERC7432 identifier is provided', async () => {
      const iface = IERC7432__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7432ImmutableRegistry.supportsInterface(ifaceId)).to.be.true
    })

    it('should return true when IERC721Receiver identifier is provided', async () => {
      const iface = IERC721Receiver__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7432ImmutableRegistry.supportsInterface(ifaceId)).to.be.true
    })
  })
})
