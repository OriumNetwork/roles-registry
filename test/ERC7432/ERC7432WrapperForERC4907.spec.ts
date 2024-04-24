import { ethers, upgrades, network } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Role } from '../types'
import { buildRole, getExpiredDate } from './mockData'
import { expect } from 'chai'
import { generateErc165InterfaceId, ROLE, THREE_MONTHS } from '../helpers'
import { beforeEach } from 'mocha'
import { IERC7432__factory, IERC7432VaultExtension__factory, IERC721Receiver__factory } from '../../typechain-types'

const UserRole = 'User()'
const NovaCreedTokenAddress = '0x8a514a40ed06fc44b6e0c9875cdd58e20063d10e'
const WrappedNovaCreedTokenAddress = '0xc30Dedd81fE3cD756bFFeE41199E86B0C3b10218'
const AccountWithNovaCreedTokens = '0x27837ffd62144628e75bab1b63eb92cca3b3c05b'
const { AddressZero } = ethers.constants

describe('ERC7432WrapperForERC4907', async () => {
  let ERC7432WrapperForERC4907: Contract
  let Erc721Token: Contract
  let WrappedErc721Token: Contract
  let owner: SignerWithAddress
  let operator: SignerWithAddress
  let recipient: SignerWithAddress
  let anotherUser: SignerWithAddress
  let marketplaceAccount: SignerWithAddress
  let role: Role

  async function deployContracts() {
    const signers = await ethers.getSigners()
    operator = signers[0]
    recipient = signers[1]
    anotherUser = signers[2]
    marketplaceAccount = signers[3]

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [AccountWithNovaCreedTokens],
    })
    await operator.sendTransaction({
      to: AccountWithNovaCreedTokens,
      value: ethers.utils.parseEther('100'),
    })

    owner = await ethers.getSigner(AccountWithNovaCreedTokens)

    const OriumWrapperManagerFactory = await ethers.getContractFactory('OriumWrapperManager')
    const OriumWrapperManagerProxy = await upgrades.deployProxy(OriumWrapperManagerFactory, [
      operator.address,
      marketplaceAccount.address,
    ])

    // set wrapper address
    await expect(
      OriumWrapperManagerProxy.connect(operator).mapToken(NovaCreedTokenAddress, WrappedNovaCreedTokenAddress),
    ).to.not.be.reverted

    // set max duration
    await expect(OriumWrapperManagerProxy.connect(operator).setMaxDuration(NovaCreedTokenAddress, THREE_MONTHS)).to.not
      .be.reverted

    const ERC7432WrapperForERC4907Factory = await ethers.getContractFactory('ERC7432WrapperForERC4907')
    ERC7432WrapperForERC4907 = await ERC7432WrapperForERC4907Factory.deploy(OriumWrapperManagerProxy.address)

    Erc721Token = await ethers.getContractAt('IERC721', NovaCreedTokenAddress)
    WrappedErc721Token = await ethers.getContractAt('IWrapNFT', WrappedNovaCreedTokenAddress)

    const block = await ethers.provider.getBlock('latest')
    role = await buildRole({
      roleId: UserRole,
      tokenAddress: NovaCreedTokenAddress,
      tokenId: 64,
      expirationDate: block.timestamp + THREE_MONTHS,
    })
  }

  async function depositNftAndGrantRole({ recipient = AddressZero }) {
    await expect(Erc721Token.connect(owner).approve(ERC7432WrapperForERC4907.address, role.tokenId)).to.not.be.reverted

    await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, recipient }))
      .to.emit(ERC7432WrapperForERC4907, 'RoleGranted')
      .withArgs(
        role.tokenAddress,
        role.tokenId,
        role.roleId,
        owner.address,
        recipient,
        role.expirationDate,
        role.revocable,
        role.data,
      )
      .to.emit(ERC7432WrapperForERC4907, 'TokensCommitted')
      .withArgs(owner.address, role.tokenAddress, role.tokenId)
      .to.emit(WrappedErc721Token, 'UpdateUser')
      .withArgs(role.tokenId, recipient, role.expirationDate)
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  describe('grantRole', async () => {
    it("should revert when role is not 'User()'", async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, roleId: ROLE })).to.be.revertedWith(
        "ERC7432WrapperForERC4907: only 'User()' role is allowed",
      )
    })

    it('should revert when token is not supported', async () => {
      const tokenAddress = AddressZero
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, tokenAddress })).to.be.revertedWith(
        'ERC7432WrapperForERC4907: token not supported',
      )
    })

    it('should revert when expiration date is in the past', async () => {
      const expirationDate = await getExpiredDate()
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, expirationDate })).to.be.revertedWith(
        'ERC7432WrapperForERC4907: invalid expiration date',
      )
    })

    it('should revert when expiration date is longer than allowed', async () => {
      const block = await ethers.provider.getBlock('latest')
      const expirationDate = block.timestamp + THREE_MONTHS + 1
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, expirationDate })).to.be.revertedWith(
        'ERC7432WrapperForERC4907: invalid expiration date',
      )
    })

    it('should revert when NFT is wrapped but not deposited in the contract', async () => {
      await Erc721Token.connect(owner).approve(WrappedErc721Token.address, role.tokenId)
      await expect(WrappedErc721Token.connect(owner).stake(role.tokenId)).to.not.be.reverted
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole(role)).to.be.revertedWith(
        'ERC7432WrapperForERC4907: contract does not own wrapped token',
      )
    })

    describe('when NFT is not deposited', async () => {
      it('should revert when sender is not approved or owner', async () => {
        await expect(ERC7432WrapperForERC4907.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC7432WrapperForERC4907: sender must be owner or approved',
        )
      })

      it('should revert when contract is not approved to transfer NFT', async () => {
        await expect(ERC7432WrapperForERC4907.connect(owner).grantRole(role)).to.be.revertedWith(
          'ERC721: transfer caller is not owner nor approved',
        )
      })

      it('should revert when sender is role approved, but contract is not approved to transfer NFT', async () => {
        await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(ERC7432WrapperForERC4907.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC721: transfer caller is not owner nor approved',
        )
      })

      it('should grant role when sender is NFT owner', async () => {
        await depositNftAndGrantRole({})
      })

      it('should grant role when sender is approved', async () => {
        await Erc721Token.connect(owner).approve(ERC7432WrapperForERC4907.address, role.tokenId)
        await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )

        await expect(ERC7432WrapperForERC4907.connect(anotherUser).grantRole(role))
          .to.emit(ERC7432WrapperForERC4907, 'RoleGranted')
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
          .to.emit(ERC7432WrapperForERC4907, 'TokensCommitted')
          .withArgs(owner.address, role.tokenAddress, role.tokenId)
          .to.emit(WrappedErc721Token, 'UpdateUser')
          .withArgs(role.tokenId, role.recipient, role.expirationDate)
      })
    })

    describe('when NFT is deposited', async () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({})
      })

      it('should revert when sender is not approved nor original owner', async () => {
        await expect(ERC7432WrapperForERC4907.connect(anotherUser).grantRole(role)).to.be.revertedWith(
          'ERC7432WrapperForERC4907: sender must be owner or approved',
        )
      })

      it('should grant role when sender is original owner', async () => {
        await expect(ERC7432WrapperForERC4907.connect(owner).grantRole(role))
          .to.emit(ERC7432WrapperForERC4907, 'RoleGranted')
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
          .to.emit(WrappedErc721Token, 'UpdateUser')
          .withArgs(role.tokenId, role.recipient, role.expirationDate)
          .to.not.emit(Erc721Token, 'Transfer')
          .to.not.emit(WrappedErc721Token, 'Transfer')
          .to.not.emit(ERC7432WrapperForERC4907, 'TokensCommitted')
      })

      it('should grant role when sender is approved', async () => {
        await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(
          role.tokenAddress,
          anotherUser.address,
          true,
        )
        await expect(ERC7432WrapperForERC4907.connect(anotherUser).grantRole(role))
          .to.emit(ERC7432WrapperForERC4907, 'RoleGranted')
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
          .to.emit(WrappedErc721Token, 'UpdateUser')
          .withArgs(role.tokenId, role.recipient, role.expirationDate)
          .to.not.emit(Erc721Token, 'Transfer')
          .to.not.emit(WrappedErc721Token, 'Transfer')
          .to.not.emit(ERC7432WrapperForERC4907, 'TokensCommitted')
      })

      it('should revert when there is a non-expired and non-revocable role', async () => {
        await ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, revocable: false })
        await expect(ERC7432WrapperForERC4907.connect(owner).grantRole(role)).to.be.revertedWith(
          'ERC7432WrapperForERC4907: role must be expired or revocable',
        )
      })
    })
  })

  describe('revokeRole', async () => {
    beforeEach(async () => {
      await depositNftAndGrantRole({ recipient: recipient.address })
    })

    it("should revert when role is not 'User()'", async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(owner).revokeRole(role.tokenAddress, role.tokenId, ROLE),
      ).to.be.revertedWith("ERC7432WrapperForERC4907: only 'User()' role is allowed")
    })

    it('should revert when token is not supported', async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(owner).revokeRole(AddressZero, role.tokenId, role.roleId),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: token not supported')
    })

    it('should revert when sender is not owner, recipient or approved', async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(anotherUser).revokeRole(role.tokenAddress, 1, role.roleId),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: sender is not recipient, owner or approved')
    })

    it('should revert when sender is owner but role is not revocable nor expired', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, revocable: false }))

      await expect(
        ERC7432WrapperForERC4907.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: role is not revocable nor expired')
    })

    it('should revoke role when sender is recipient', async () => {
      await expect(ERC7432WrapperForERC4907.connect(recipient).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should revoke role when sender is approved by recipient', async () => {
      await ERC7432WrapperForERC4907.connect(recipient).setRoleApprovalForAll(
        role.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        ERC7432WrapperForERC4907.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should revoke role when sender is owner (and role is revocable)', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should revoke role when sender is owner, and role is not revocable but is expired', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, revocable: false }))
        .to.emit(ERC7432WrapperForERC4907, 'RoleGranted')
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
        .to.not.emit(Erc721Token, 'Transfer')
        .to.not.emit(ERC7432WrapperForERC4907, 'TokensCommitted')
      await time.increase(THREE_MONTHS)
      await expect(ERC7432WrapperForERC4907.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should revoke role when sender is approved by owner (and role is revocable)', async () => {
      await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(
        ERC7432WrapperForERC4907.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should revoke role when sender is approved both by owner and recipient, and role not revocable', async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(owner).grantRole({
          ...role,
          recipient: recipient.address,
          revocable: false,
        }),
      )
      await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await ERC7432WrapperForERC4907.connect(recipient).setRoleApprovalForAll(
        role.tokenAddress,
        anotherUser.address,
        true,
      )
      await expect(
        ERC7432WrapperForERC4907.connect(anotherUser).revokeRole(role.tokenAddress, role.tokenId, role.roleId),
      )
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)
        .to.emit(WrappedErc721Token, 'UpdateUser')
        .withArgs(role.tokenId, AddressZero, 0)
    })

    it('should not delete original owner when revoking role', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).revokeRole(role.tokenAddress, role.tokenId, role.roleId))
        .to.emit(ERC7432WrapperForERC4907, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId)

      expect(await ERC7432WrapperForERC4907.originalOwners(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
    })
  })

  describe('withdraw', async () => {
    beforeEach(async () => {
      await depositNftAndGrantRole({ recipient: recipient.address })
    })

    it('should revert when token is not supported', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).withdraw(AddressZero, role.roleId)).to.be.revertedWith(
        'ERC7432WrapperForERC4907: token not supported',
      )
    })

    it('should revert if token is not deposited', async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(owner).withdraw(role.tokenAddress, role.tokenId + 1),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: sender must be owner or approved')
    })

    it('should revert if sender is not original owner or approved', async () => {
      await expect(
        ERC7432WrapperForERC4907.connect(anotherUser).withdraw(role.tokenAddress, role.tokenId),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: sender must be owner or approved')
    })

    it('should revert if role is not revocable and not expired', async () => {
      await ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, revocable: false })
      await expect(
        ERC7432WrapperForERC4907.connect(owner).withdraw(role.tokenAddress, role.tokenId),
      ).to.be.revertedWith('ERC7432WrapperForERC4907: token is not withdrawable')
    })

    it('should withdraw if sender is owner and NFT is withdrawable', async () => {
      await expect(ERC7432WrapperForERC4907.connect(owner).withdraw(role.tokenAddress, role.tokenId))
        .to.emit(ERC7432WrapperForERC4907, 'Withdraw')
        .withArgs(owner.address, role.tokenAddress, role.tokenId)
        .to.emit(WrappedErc721Token, 'Redeem')
        .withArgs(ERC7432WrapperForERC4907.address, role.tokenAddress, role.tokenId)
        .to.emit(Erc721Token, 'Transfer')
        .withArgs(ERC7432WrapperForERC4907.address, owner.address, role.tokenId)
    })

    it('should revert if role is not revocable, but is expired', async () => {
      await ERC7432WrapperForERC4907.connect(owner).grantRole({ ...role, revocable: false })
      await time.increase(THREE_MONTHS)
      await expect(ERC7432WrapperForERC4907.connect(owner).withdraw(role.tokenAddress, role.tokenId))
        .to.emit(ERC7432WrapperForERC4907, 'Withdraw')
        .withArgs(owner.address, role.tokenAddress, role.tokenId)
        .to.emit(WrappedErc721Token, 'Redeem')
        .withArgs(ERC7432WrapperForERC4907.address, role.tokenAddress, role.tokenId)
        .to.emit(Erc721Token, 'Transfer')
        .withArgs(ERC7432WrapperForERC4907.address, owner.address, role.tokenId)
    })

    it('should withdraw if sender is approved and NFT is withdrawable', async () => {
      await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      await expect(ERC7432WrapperForERC4907.connect(anotherUser).withdraw(role.tokenAddress, role.tokenId))
        .to.emit(ERC7432WrapperForERC4907, 'Withdraw')
        .withArgs(owner.address, role.tokenAddress, role.tokenId)
        .to.emit(WrappedErc721Token, 'Redeem')
        .withArgs(ERC7432WrapperForERC4907.address, role.tokenAddress, role.tokenId)
        .to.emit(Erc721Token, 'Transfer')
        .withArgs(ERC7432WrapperForERC4907.address, owner.address, role.tokenId)
    })
  })

  describe('view functions', async () => {
    describe('when NFT is not deposited', async () => {
      it('recipientOf should return default value', async () => {
        expect(await ERC7432WrapperForERC4907.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          AddressZero,
        )
      })

      it('roleData should return default value', async () => {
        expect(await ERC7432WrapperForERC4907.roleData(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal('0x')
      })

      it('roleExpirationDate should return default value', async () => {
        expect(
          await ERC7432WrapperForERC4907.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(0)
      })

      it('isRoleRevocable should return default value', async () => {
        expect(await ERC7432WrapperForERC4907.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.false
      })
    })

    describe('when NFT is deposited', async () => {
      beforeEach(async () => {
        await depositNftAndGrantRole({ recipient: recipient.address })
      })

      it('ownerOf should return value from mapping', async () => {
        expect(await ERC7432WrapperForERC4907.ownerOf(role.tokenAddress, role.tokenId)).to.be.equal(owner.address)
      })

      it('recipientOf should return value from mapping', async () => {
        expect(await ERC7432WrapperForERC4907.recipientOf(role.tokenAddress, role.tokenId, role.roleId)).to.be.equal(
          recipient.address,
        )
      })

      it('roleExpirationDate should the expiration date of the role', async () => {
        expect(
          await ERC7432WrapperForERC4907.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId),
        ).to.be.equal(role.expirationDate)
      })

      it('isRoleRevocable should whether the role is revocable', async () => {
        expect(await ERC7432WrapperForERC4907.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)).to.be.true
      })

      describe('when tokenAddress or role are not supported', async () => {
        it('recipientOf should return default value', async () => {
          expect(await ERC7432WrapperForERC4907.recipientOf(AddressZero, role.tokenId, role.roleId)).to.be.equal(
            AddressZero,
          )
          expect(await ERC7432WrapperForERC4907.recipientOf(role.tokenAddress, role.tokenId, ROLE)).to.be.equal(
            AddressZero,
          )
        })

        it('roleData should return default value', async () => {
          expect(await ERC7432WrapperForERC4907.roleData(AddressZero, role.tokenId, role.roleId)).to.be.equal('0x')
          expect(await ERC7432WrapperForERC4907.roleData(role.tokenAddress, role.tokenId, ROLE)).to.be.equal('0x')
        })

        it('roleExpirationDate should return default value', async () => {
          expect(await ERC7432WrapperForERC4907.roleExpirationDate(AddressZero, role.tokenId, role.roleId)).to.be.equal(
            0,
          )
          expect(await ERC7432WrapperForERC4907.roleExpirationDate(role.tokenAddress, role.tokenId, ROLE)).to.be.equal(
            0,
          )
        })
      })
    })
  })

  describe('isRoleApprovedForAll', async () => {
    it('should return false when not approved', async () => {
      expect(await ERC7432WrapperForERC4907.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address))
        .to.be.false
    })

    it('should return true when approved', async () => {
      await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      expect(await ERC7432WrapperForERC4907.isRoleApprovedForAll(role.tokenAddress, owner.address, anotherUser.address))
        .to.be.true
    })

    it('should always return true when operator is the marketplace', async () => {
      await ERC7432WrapperForERC4907.connect(owner).setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true)
      expect(await ERC7432WrapperForERC4907.isRoleApprovedForAll(AddressZero, AddressZero, marketplaceAccount.address))
        .to.be.true
    })
  })

  describe('ERC-165', async () => {
    it('should return true when IERC7432 identifier is provided', async () => {
      const iface = IERC7432__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7432WrapperForERC4907.supportsInterface(ifaceId)).to.be.true
    })

    it('should return true when IERC7432VaultExtension identifier is provided', async () => {
      const iface = IERC7432VaultExtension__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7432WrapperForERC4907.supportsInterface(ifaceId)).to.be.true
    })

    it('should return true when IERC721Receiver identifier is provided', async () => {
      const iface = IERC721Receiver__factory.createInterface()
      const ifaceId = generateErc165InterfaceId(iface)
      expect(await ERC7432WrapperForERC4907.supportsInterface(ifaceId)).to.be.true
    })
  })
})
