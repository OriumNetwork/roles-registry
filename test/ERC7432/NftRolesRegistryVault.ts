import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { beforeEach } from 'mocha'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { Role } from '../types'
import { buildRole, getExpiredDate } from './mockData'
import { expect } from 'chai'
import { IERC7432__factory } from '../../typechain-types'
import { generateErc165InterfaceId, ONE_DAY } from '../helpers'

const { AddressZero, HashZero } = ethers.constants

describe('NftRolesRegistryVault', () => {
  let NftRolesRegistryVault: Contract
  let MockErc721Token: Contract
  let owner: SignerWithAddress
  let recipient: SignerWithAddress
  let anotherUser: SignerWithAddress
  let role: Role

  async function deployContracts() {
    const SftRolesRegistryFactory = await ethers.getContractFactory('NftRolesRegistryVault')
    NftRolesRegistryVault = await SftRolesRegistryFactory.deploy()
    const MockErc721TokenFactory = await ethers.getContractFactory('MockERC721')
    MockErc721Token = await MockErc721TokenFactory.deploy()
    const signers = await ethers.getSigners()
    owner = signers[0]
    recipient = signers[1]
    anotherUser = signers[2]
  }

  async function depositNftAndGrantRole({ recipient = AddressZero, revocable = role.revocable }) {
    await MockErc721Token.connect(owner).approve(NftRolesRegistryVault.address, role.tokenId)
    await expect(NftRolesRegistryVault.connect(owner).grantRole({ ...role, recipient, revocable }))
      .to.emit(NftRolesRegistryVault, 'RoleGranted')
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
      .withArgs(owner.address, NftRolesRegistryVault.address, role.tokenId)
      .to.emit(NftRolesRegistryVault, 'TokenLocked')
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
      await expect(NftRolesRegistryVault.connect(owner).grantRole(role)).to.be.revertedWith(
        'NftRolesRegistryVault: expiration date must be in the future',
      )
    })

    it('should revert when tokenAddress is not an ERC-721', async () => {
      const role = await buildRole({})
      await expect(NftRolesRegistryVault.connect(owner).grantRole(role)).to.be.reverted
    })

    describe('when NFT is not deposited', () => {
      it('should revert when sender is not approved or owner', async () => {
        await expect(NftRolesRegistryVault.connect(recipient).grantRole(role)).to.be.revertedWith(
          'NftRolesRegistryVault: sender must be owner or approved',
        )
      })

      it('should revert when contract is not approved to transfer NFT', async () => {
        await expect(NftRolesRegistryVault.connect(owner).grantRole(role)).to.be.revertedWith(
          'ERC721: caller is not token owner or approved',
        )
      })

      it('should revert when sender is role approved, but contract is not approved to transfer NFT', async () => {
        await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
        await expect(NftRolesRegistryVault.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC721: caller is not token owner or approved',
        )
      })

      it('should grant role when sender is NFT owner', async () => {
        await depositNftAndGrantRole({})
      })

      it('should grant role when sender is approved', async () => {
        await MockErc721Token.connect(owner).approve(NftRolesRegistryVault.address, role.tokenId)
        await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
        await expect(NftRolesRegistryVault.connect(anotherUser).grantRole(role))
          .to.emit(NftRolesRegistryVault, 'RoleGranted')
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
          .withArgs(owner.address, NftRolesRegistryVault.address, role.tokenId)
          .to.emit(NftRolesRegistryVault, 'TokenLocked')
          .withArgs(owner.address, role.tokenAddress, role.tokenId)
      })
    })

    describe('when NFT is deposited', () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({})
      })

      it('should revert when sender is not approved nor original owner', async () => {
        await expect(NftRolesRegistryVault.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'NftRolesRegistryVault: sender must be owner or approved',
        )
      })

      it('should grant role when sender is original owner', async () => {
        await expect(NftRolesRegistryVault.connect(owner).grantRole(role))
          .to.emit(NftRolesRegistryVault, 'RoleGranted')
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
          .to.not.emit(NftRolesRegistryVault, 'TokenLocked')
      })

      it('should grant role when sender is approved', async () => {
        await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
        await expect(NftRolesRegistryVault.connect(anotherUser).grantRole(role))
          .to.emit(NftRolesRegistryVault, 'RoleGranted')
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
          .to.not.emit(NftRolesRegistryVault, 'TokenLocked')
      })

      it('should revert when there is a non-expired and non-revocable role', async () => {
        await NftRolesRegistryVault.connect(owner).grantRole({ ...role, revocable: false })
        await expect(NftRolesRegistryVault.connect(owner).grantRole(role)).to.be.revertedWith(
          'NftRolesRegistryVault: role must be expired or revocable',
        )
      })
    })
  })

  describe('revokeRole', () => {
    beforeEach(async () => {
      await depositNftAndGrantRole({ recipient: recipient.address })
    })

    it('should revert when sender is not owner, recipient or approved', async () => {
      await expect(
        NftRolesRegistryVault.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('NftRolesRegistryVault: role does not exist or sender is not approved')
    })

    it('should revert when sender is owner but role is not revocable nor expired', async () => {
      await expect(NftRolesRegistryVault.connect(owner).grantRole({ ...role, revocable: false }))

      await expect(
        NftRolesRegistryVault.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('NftRolesRegistryVault: role is not revocable nor expired')
    })

    it('should revoke role when sender is recipient', async () => {
      await expect(NftRolesRegistryVault.connect(recipient).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved by recipient', async () => {
      await NftRolesRegistryVault.connect(recipient).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(NftRolesRegistryVault.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is owner (and role is revocable)', async () => {
      await expect(NftRolesRegistryVault.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is owner, and role is not revocable but is expired', async () => {
      await expect(NftRolesRegistryVault.connect(owner).grantRole({ ...role, revocable: false }))
        .to.emit(NftRolesRegistryVault, 'RoleGranted')
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
        .to.not.emit(NftRolesRegistryVault, 'TokenLocked')

      await time.increase(ONE_DAY)
      await expect(NftRolesRegistryVault.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved by owner (and role is revocable)', async () => {
      await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(NftRolesRegistryVault.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should revoke role when sender is approved both by owner and recipient, and role not revocable', async () => {
      await expect(
        NftRolesRegistryVault.connect(owner).grantRole({
          ...role,
          recipient: recipient.address,
          revocable: false,
        }),
      )
      await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await NftRolesRegistryVault.connect(recipient).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(NftRolesRegistryVault.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
    })

    it('should not delete original owner when revoking role', async () => {
      await expect(NftRolesRegistryVault.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(NftRolesRegistryVault, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)

      expect(await NftRolesRegistryVault.originalOwners(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
    })
  })

  describe('unlockToken', () => {
    describe('when NFT is not deposited', () => {
      it('should revert if token is not deposited', async () => {
        await depositNftAndGrantRole({ recipient: recipient.address, revocable: false })
        await expect(
          NftRolesRegistryVault.connect(owner).unlockToken(role.tokenAddress, role.tokenId),
        ).to.be.revertedWith('NftRolesRegistryVault: NFT is locked')
      })
    })

    describe('when NFT is deposited', () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({ recipient: recipient.address })
      })

      it('should revert if sender is not original owner or approved', async () => {
        await expect(
          NftRolesRegistryVault.connect(anotherUser).unlockToken(role.tokenAddress, role.tokenId),
        ).to.be.revertedWith('NftRolesRegistryVault: sender must be owner or approved')
      })

      it('should unlock token if sender is owner and NFT is not locked', async () => {
        await expect(NftRolesRegistryVault.connect(owner).unlockToken(role.tokenAddress, role.tokenId))
          .to.emit(NftRolesRegistryVault, 'TokenUnlocked')
          .withArgs(owner.address, role.tokenAddress, role.tokenId)
          .to.emit(MockErc721Token, 'Transfer')
          .withArgs(NftRolesRegistryVault.address, owner.address, role.tokenId)
      })

      it('should unlock token if sender is approved and NFT is not locked', async () => {
        await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
        await expect(NftRolesRegistryVault.connect(anotherUser).unlockToken(role.tokenAddress, role.tokenId))
          .to.emit(NftRolesRegistryVault, 'TokenUnlocked')
          .withArgs(owner.address, role.tokenAddress, role.tokenId)
          .to.emit(MockErc721Token, 'Transfer')
          .withArgs(NftRolesRegistryVault.address, owner.address, role.tokenId)
      })
    })
  })

  describe('view functions', async () => {
    describe('when NFT is not deposited', async () => {
      it('recipientOf should return default value', async () => {
        expect(await NftRolesRegistryVault.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          AddressZero,
        )
      })

      it('roleData should return default value', async () => {
        expect(await NftRolesRegistryVault.roleData(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal('0x')
      })

      it('roleExpirationDate should return default value', async () => {
        expect(
          await NftRolesRegistryVault.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(0)
      })

      it('isRoleRevocable should return default value', async () => {
        expect(await NftRolesRegistryVault.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.false
      })
    })

    describe('when NFT is deposited', async () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({ recipient: recipient.address })
      })

      it('ownerOf should return value from mapping', async () => {
        expect(await NftRolesRegistryVault.ownerOf(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
      })

      it('recipientOf should return value from mapping', async () => {
        expect(await NftRolesRegistryVault.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          recipient.address,
        )
      })

      it('roleData should return the custom data of the role', async () => {
        expect(await NftRolesRegistryVault.roleData(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(HashZero)
      })

      it('roleExpirationDate should the expiration date of the role', async () => {
        expect(
          await NftRolesRegistryVault.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(role.expirationDate)
      })

      it('isRoleRevocable should whether the role is revocable', async () => {
        expect(await NftRolesRegistryVault.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.true
      })
    })
  })

  describe('isRoleApprovedForAll', async () => {
    it('should return false when not approved', async () => {
      expect(await NftRolesRegistryVault.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address)).to
        .be.false
    })

    it('should return true when approved', async () => {
      await NftRolesRegistryVault.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      expect(await NftRolesRegistryVault.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address)).to
        .be.true
    })
  })

  describe('ERC-165', async () => {
    it('should return true when IERC7432 identifier is provided', async () => {
      const iface = IERC7432__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await NftRolesRegistryVault.supportsInterface(ifaceId)).to.be.true
    })
  })
})
