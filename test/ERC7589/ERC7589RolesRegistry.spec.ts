import { ethers } from 'hardhat'
import { Contract, BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { beforeEach } from 'mocha'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import {
  IERC1155Receiver__factory,
  IERC7589__factory,
  IERC7589LockTokensAndGrantRoleExtension__factory,
} from '../../typechain-types'
import { generateErc165InterfaceId, generateRandomInt, ONE_DAY, ROLE, ZERO } from '../helpers'

const { AddressZero, HashZero } = ethers.constants

describe('ERC7589RolesRegistry', async () => {
  let ERC7589RolesRegistry: Contract
  let MockErc1155Token: Contract
  let owner: SignerWithAddress
  let recipient: SignerWithAddess
  let anotherUser: SignerWithAddress
  let tokenId: BigNumber
  let tokenAmount: BigNumber
  let expirationDate: number
  const lockId = BigNumber.from(1)

  async function deployContracts() {
    const ERC7589RolesRegistryFactory = await ethers.getContractFactory('ERC7589RolesRegistry')
    ERC7589RolesRegistry = await ERC7589RolesRegistryFactory.deploy(AddressZero)
    const MockErc1155TokenFactory = await ethers.getContractFactory('MockERC1155')
    MockErc1155Token = await MockErc1155TokenFactory.deploy()
    await expect(ERC7589RolesRegistry.setTokenAddressAllowed(MockErc1155Token.address, true)).to.not.be.reverted
    const signers = await ethers.getSigners()
    owner = signers[0]
    recipient = signers[1]
    anotherUser = signers[2]
    expirationDate = (await time.latest()) + ONE_DAY
  }

  async function lockTokens(sender: SignerWithAddress) {
    await expect(
      ERC7589RolesRegistry.connect(sender).lockTokens(owner.address, MockErc1155Token.address, tokenId, tokenAmount),
    )
      .to.emit(ERC7589RolesRegistry, 'TokensLocked')
      .withArgs(owner.address, 1, MockErc1155Token.address, tokenId, tokenAmount)
      .to.emit(MockErc1155Token, 'TransferSingle')
      .withArgs(ERC7589RolesRegistry.address, owner.address, ERC7589RolesRegistry.address, tokenId, tokenAmount)
  }

  async function grantRole({ sender = owner, revocable = true } = {}) {
    await expect(
      ERC7589RolesRegistry.connect(sender).grantRole(
        lockId,
        ROLE,
        recipient.address,
        expirationDate,
        revocable,
        HashZero,
      ),
    )
      .to.emit(ERC7589RolesRegistry, 'RoleGranted')
      .withArgs(lockId, ROLE, recipient.address, expirationDate, revocable, HashZero)
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
    tokenId = BigNumber.from(generateRandomInt())
    tokenAmount = BigNumber.from(generateRandomInt())
    await expect(MockErc1155Token.mint(owner.address, tokenId, tokenAmount)).to.not.be.reverted
  })

  describe('lockTokens', async () => {
    it('should revert when sender is not owner or approved', async () => {
      await expect(
        ERC7589RolesRegistry.connect(anotherUser).lockTokens(
          owner.address,
          MockErc1155Token.address,
          tokenId,
          tokenAmount,
        ),
      ).to.be.revertedWith('ERC7589RolesRegistry: sender is not owner or approved')
    })

    it('should revert when tokenAmount is zero', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).lockTokens(owner.address, MockErc1155Token.address, tokenId, 0),
      ).to.be.revertedWith('ERC7589RolesRegistry: tokenAmount must be greater than zero')
    })

    it('should revert without a reason if tokenAddress is not an ERC-1155 contract', async () => {
      await expect(ERC7589RolesRegistry.connect(owner).lockTokens(owner.address, AddressZero, tokenId, tokenAmount)).to
        .be.reverted
    })

    it('should revert if contract is not approved to transfer tokens', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).lockTokens(owner.address, MockErc1155Token.address, tokenId, tokenAmount),
      ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })

    it('should revert when owner does not have enough tokens', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).lockTokens(
          owner.address,
          MockErc1155Token.address,
          tokenId,
          tokenAmount.add(1),
        ),
      ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })

    it('should lock tokens when sender is owner', async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await lockTokens(owner)
    })

    it('should lock tokens when sender is approved', async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await expect(
        ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(MockErc1155Token.address, anotherUser.address, true),
      ).to.not.be.reverted
      await lockTokens(anotherUser)
    })

    it('should lock tokens when sender is marketplace contract', async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await expect(ERC7589RolesRegistry.connect(owner).setMarketplaceAddress(anotherUser.address)).to.not.be.reverted
      await lockTokens(anotherUser)
    })
  })

  describe('grantRole', async () => {
    beforeEach(async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await lockTokens(owner)
    })

    it('should revert when sender is not owner or approved', async () => {
      await expect(
        ERC7589RolesRegistry.connect(anotherUser).grantRole(
          lockId,
          ROLE,
          recipient.address,
          expirationDate,
          false,
          HashZero,
        ),
      ).to.be.revertedWith('ERC7589RolesRegistry: sender is not owner or approved')
    })

    it('should revert when expirationDate is in the past', async () => {
      const pastExpirationDate = (await time.latest()) - 1
      await expect(
        ERC7589RolesRegistry.connect(owner).grantRole(
          lockId,
          ROLE,
          recipient.address,
          pastExpirationDate,
          false,
          HashZero,
        ),
      ).to.be.revertedWith('ERC7589RolesRegistry: expirationDate must be in the future')
    })

    it('should revert when previous role is not revocable or expired', async () => {
      await grantRole({ revocable: false })
      await expect(
        ERC7589RolesRegistry.connect(owner).grantRole(lockId, ROLE, recipient.address, expirationDate, false, HashZero),
      ).to.be.revertedWith('ERC7589RolesRegistry: role is not expired nor revocable')
    })

    it('should grant role when previous role is not expired but is revocable', async () => {
      await grantRole({ revocable: true })
      await grantRole()
    })

    it('should grant role when sender is owner', async () => {
      await grantRole()
    })

    it('should grant role when sender is approved', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(MockErc1155Token.address, anotherUser.address, true),
      ).to.not.be.reverted
      await grantRole({ sender: anotherUser })
    })
  })

  describe('revokeRole', async () => {
    beforeEach(async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await lockTokens(owner)
      await grantRole()
    })

    it('should revert when sender is not owner, recipient or approved', async () => {
      await expect(
        ERC7589RolesRegistry.connect(anotherUser).revokeRole(lockId, ROLE, recipient.address),
      ).to.be.revertedWith('ERC7589RolesRegistry: sender is not approved')
    })

    it('should revert when sender is owner but role is not revocable nor expired', async () => {
      await grantRole({ revocable: false })
      await expect(ERC7589RolesRegistry.connect(owner).revokeRole(lockId, ROLE, recipient.address)).to.be.revertedWith(
        'ERC7589RolesRegistry: role is not revocable or caller is not the approved',
      )
    })

    it('should revert when role is expired', async () => {
      await grantRole()
      await time.increase(ONE_DAY)

      await expect(ERC7589RolesRegistry.revokeRole(lockId, ROLE, recipient.address)).to.be.revertedWith(
        'ERC7589RolesRegistry: role does not exist',
      )
    })

    it('should revert when role was already revoked', async () => {
      await expect(ERC7589RolesRegistry.revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)

      await expect(ERC7589RolesRegistry.revokeRole(lockId, ROLE, recipient.address)).to.be.revertedWith(
        'ERC7589RolesRegistry: role does not exist',
      )
    })

    it('should revoke role when sender is recipient', async () => {
      await expect(ERC7589RolesRegistry.connect(recipient).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)
    })

    it('should revoke role when sender is approved by recipient', async () => {
      await expect(
        ERC7589RolesRegistry.connect(recipient).setRoleApprovalForAll(
          MockErc1155Token.address,
          anotherUser.address,
          true,
        ),
      ).to.not.be.reverted
      await expect(ERC7589RolesRegistry.connect(anotherUser).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)
    })

    it('should revoke role when sender is owner (and role is revocable)', async () => {
      await expect(ERC7589RolesRegistry.connect(owner).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)
    })

    it('should revoke role when sender is approved by owner (and role is revocable)', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(MockErc1155Token.address, anotherUser.address, true),
      ).to.not.be.reverted

      await expect(ERC7589RolesRegistry.connect(anotherUser).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)
    })

    it('should revoke role when sender is approved both by owner and recipient, and role not revocable', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(MockErc1155Token.address, anotherUser.address, true),
      ).to.not.be.reverted
      await expect(
        ERC7589RolesRegistry.connect(recipient).setRoleApprovalForAll(
          MockErc1155Token.address,
          anotherUser.address,
          true,
        ),
      ).to.not.be.reverted

      await grantRole({ revocable: false })
      await expect(ERC7589RolesRegistry.connect(anotherUser).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)
    })

    it('should not delete original owner when revoking role', async () => {
      expect(await ERC7589RolesRegistry.roleExpirationDate(lockId, ROLE)).to.be.greaterThan(ZERO)

      await expect(ERC7589RolesRegistry.connect(owner).revokeRole(lockId, ROLE, recipient.address))
        .to.emit(ERC7589RolesRegistry, 'RoleRevoked')
        .withArgs(lockId, ROLE, recipient.address)

      expect(await ERC7589RolesRegistry.ownerOf(lockId)).to.be.equal(owner.address)
      expect(await ERC7589RolesRegistry.roleExpirationDate(lockId, ROLE)).to.be.equal(ZERO)
    })
  })

  describe('unlockTokens', async () => {
    beforeEach(async () => {
      await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
        .reverted
      await lockTokens(owner)
      await grantRole()
    })

    it('should revert if lockId does not exist', async () => {
      await expect(ERC7589RolesRegistry.connect(recipient).unlockTokens(BigNumber.from(2))).to.be.revertedWith(
        'ERC7589RolesRegistry: sender is not owner or approved',
      )
    })

    it('should revert if sender is not owner or approved', async () => {
      await expect(ERC7589RolesRegistry.connect(anotherUser).unlockTokens(lockId)).to.be.revertedWith(
        'ERC7589RolesRegistry: sender is not owner or approved',
      )
    })

    it('should revert if NFT is locked', async () => {
      await grantRole({ revocable: false })

      await expect(ERC7589RolesRegistry.unlockTokens(lockId)).to.be.revertedWith('ERC7589RolesRegistry: NFT is locked')
    })

    it('should unlock token if sender is owner and NFT is not locked', async () => {
      await expect(ERC7589RolesRegistry.connect(owner).unlockTokens(lockId))
        .to.emit(ERC7589RolesRegistry, 'TokensUnlocked')
        .withArgs(lockId)
        .to.emit(MockErc1155Token, 'TransferSingle')
        .withArgs(ERC7589RolesRegistry.address, ERC7589RolesRegistry.address, owner.address, tokenId, tokenAmount)
    })

    it('should unlock token if sender is approved and NFT is not locked', async () => {
      await expect(
        ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(MockErc1155Token.address, anotherUser.address, true),
      ).to.not.be.reverted

      await expect(ERC7589RolesRegistry.connect(anotherUser).unlockTokens(lockId))
        .to.emit(ERC7589RolesRegistry, 'TokensUnlocked')
        .withArgs(lockId)
        .to.emit(MockErc1155Token, 'TransferSingle')
        .withArgs(ERC7589RolesRegistry.address, ERC7589RolesRegistry.address, owner.address, tokenId, tokenAmount)
    })
  })

  describe('setRoleApprovalForAll', async () => {
    it('should approve and revoke role approval for all', async () => {
      expect(await ERC7589RolesRegistry.isRoleApprovedForAll(AddressZero, owner.address, anotherUser.address)).to.be
        .false
      expect(await ERC7589RolesRegistry.connect(owner).setRoleApprovalForAll(AddressZero, anotherUser.address, true))
        .to.emit(ERC7589RolesRegistry, 'RoleApprovalForAll')
        .withArgs(AddressZero, owner.address, anotherUser.address, true)
      expect(await ERC7589RolesRegistry.isRoleApprovedForAll(AddressZero, owner.address, anotherUser.address)).to.be
        .true
    })
  })

  describe('View Functions', async () => {
    describe('when role is expired or does not exist', async () => {
      it('roleData should return default value', async () => {
        expect(await ERC7589RolesRegistry.roleData(lockId, ROLE)).to.be.equal('0x')
      })

      it('roleExpirationDate should return default value', async () => {
        expect(await ERC7589RolesRegistry.roleExpirationDate(lockId, ROLE)).to.be.equal(0)
      })

      it('isRoleRevocable should return default value', async () => {
        expect(await ERC7589RolesRegistry.isRoleRevocable(lockId, ROLE)).to.be.false
      })
    })

    describe('when role exists and is not expired', async () => {
      beforeEach(async () => {
        await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
          .reverted
        await lockTokens(owner)
        await grantRole()
      })

      it('ownerOf should return owner', async () => {
        expect(await ERC7589RolesRegistry.ownerOf(lockId)).to.be.equal(owner.address)
      })

      it('tokenAddressOf should return tokenAddress', async () => {
        expect(await ERC7589RolesRegistry.tokenAddressOf(lockId)).to.be.equal(MockErc1155Token.address)
      })

      it('tokenIdOf should return tokenId', async () => {
        expect(await ERC7589RolesRegistry.tokenIdOf(lockId)).to.be.equal(tokenId)
      })

      it('tokenAmountOf should return tokenAmount', async () => {
        expect(await ERC7589RolesRegistry.tokenAmountOf(lockId)).to.be.equal(tokenAmount)
      })

      it('roleData should return custom data', async () => {
        expect(await ERC7589RolesRegistry.roleData(lockId, ROLE)).to.be.equal(HashZero)
      })

      it('roleExpirationDate should return the expiration date', async () => {
        expect(await ERC7589RolesRegistry.roleExpirationDate(lockId, ROLE)).to.be.equal(expirationDate)
      })

      it('isRoleRevocable should return whether the role is revocable', async () => {
        expect(await ERC7589RolesRegistry.isRoleRevocable(lockId, ROLE)).to.be.true
      })
    })
  })

  describe('Optional Extensions', async () => {
    describe('IERC7589LockTokensAndGrantRoleExtension', async () => {
      it('should lock tokens and grant role in a single transaction', async () => {
        await expect(MockErc1155Token.connect(owner).setApprovalForAll(ERC7589RolesRegistry.address, true)).to.not.be
          .reverted

        await expect(
          ERC7589RolesRegistry.connect(owner).lockTokensAndGrantRole(
            owner.address,
            MockErc1155Token.address,
            tokenId,
            tokenAmount,
            ROLE,
            recipient.address,
            expirationDate,
            true,
            HashZero,
          ),
        )
          .to.emit(ERC7589RolesRegistry, 'TokensLocked')
          .withArgs(owner.address, 1, MockErc1155Token.address, tokenId, tokenAmount)
          .to.emit(MockErc1155Token, 'TransferSingle')
          .withArgs(ERC7589RolesRegistry.address, owner.address, ERC7589RolesRegistry.address, tokenId, tokenAmount)
          .to.emit(ERC7589RolesRegistry, 'RoleGranted')
          .withArgs(lockId, ROLE, recipient.address, expirationDate, true, HashZero)
      })
    })
  })

  describe('Manager Functions', async () => {
    it('should revert if not manager', async () => {
      await expect(
        ERC7589RolesRegistry.connect(anotherUser).setTokenAddressAllowed(MockErc1155Token.address, true),
      ).to.be.revertedWith('ERC7589RolesRegistry: sender is not manager')
      await expect(ERC7589RolesRegistry.connect(anotherUser).setManagerAddress(anotherUser.address)).to.be.revertedWith(
        'ERC7589RolesRegistry: sender is not manager',
      )
      await expect(
        ERC7589RolesRegistry.connect(anotherUser).setMarketplaceAddress(anotherUser.address),
      ).to.be.revertedWith('ERC7589RolesRegistry: sender is not manager')
    })

    it('should transfer manager role', async () => {
      expect(await ERC7589RolesRegistry.managerAddress()).to.be.equal(owner.address)
      await expect(ERC7589RolesRegistry.setManagerAddress(anotherUser.address)).to.not.be.reverted
      expect(await ERC7589RolesRegistry.managerAddress()).to.be.equal(anotherUser.address)
    })

    it('should set marketplace address', async () => {
      expect(await ERC7589RolesRegistry.marketplaceAddress()).to.be.equal(AddressZero)
      await expect(ERC7589RolesRegistry.setMarketplaceAddress(anotherUser.address)).to.not.be.reverted
      expect(await ERC7589RolesRegistry.marketplaceAddress()).to.be.equal(anotherUser.address)
    })

    it('should set tokenAddress allowed status', async () => {
      expect(await ERC7589RolesRegistry.isTokenAddressAllowed(AddressZero)).to.be.false
      await expect(ERC7589RolesRegistry.setTokenAddressAllowed(AddressZero, true)).to.not.be.reverted
      expect(await ERC7589RolesRegistry.isTokenAddressAllowed(AddressZero)).to.be.true
      await expect(ERC7589RolesRegistry.setTokenAddressAllowed(AddressZero, false)).to.not.be.reverted
      expect(await ERC7589RolesRegistry.isTokenAddressAllowed(AddressZero)).to.be.false
    })
  })

  describe('ERC-165 supportsInterface', async () => {
    it('should return true when IERC1155Receiver identifier is provided', async () => {
      const iface = IERC1155Receiver__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7589RolesRegistry.supportsInterface(ifaceId)).to.be.true
    })

    it('should return true when IERC7589 identifier is provided', async () => {
      const iface = IERC7589__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7589RolesRegistry.supportsInterface(ifaceId)).to.be.true
    })

    it('should return true when IERC7589LockTokensAndGrantRoleExtension identifier is provided', async () => {
      const iface = IERC7589LockTokensAndGrantRoleExtension__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7589RolesRegistry.supportsInterface(ifaceId)).to.be.true
    })
  })
})
