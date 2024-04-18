import { beforeEach } from 'mocha'
import { expect } from 'chai'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const { AddressZero } = ethers.constants

describe('OriumWrapperManager', async () => {
  let OriumWrapperManager: Contract
  let operator: SignerWithAddress
  let marketplaceAccount: SignerWithAddress
  let token1: SignerWithAddress
  let token2: SignerWithAddress

  async function deployContracts() {
    const signers = await ethers.getSigners()
    operator = signers[0]
    marketplaceAccount = signers[1]
    token1 = signers[2]
    token2 = signers[3]

    const OriumWrapperManagerFactory = await ethers.getContractFactory('OriumWrapperManager')
    OriumWrapperManager = await upgrades.deployProxy(OriumWrapperManagerFactory, [
      operator.address,
      marketplaceAccount.address,
    ])
  }

  beforeEach(async () => {
    await loadFixture(deployContracts)
  })

  it('ensure that only owner can call setter functions', async () => {
    await expect(
      OriumWrapperManager.connect(marketplaceAccount).setMarketplaceAddress(marketplaceAccount.address),
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      OriumWrapperManager.connect(marketplaceAccount).mapToken(token1.address, token2.address),
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(OriumWrapperManager.connect(marketplaceAccount).unmapToken(token1.address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
    await expect(
      OriumWrapperManager.connect(marketplaceAccount).setMaxDuration(token1.address, 1000),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('should set and get marketplace address', async () => {
    expect(await OriumWrapperManager.setMarketplaceAddress(marketplaceAccount.address)).to.not.be.reverted
    expect(await OriumWrapperManager.getMarketplaceAddressOf(AddressZero)).to.equal(marketplaceAccount.address)
  })

  it('should set, get, and unset wrapper token', async () => {
    expect(await OriumWrapperManager.mapToken(token1.address, token2.address)).to.not.be.reverted
    expect(await OriumWrapperManager.getWrappedTokenOf(token1.address)).to.equal(token2.address)
    expect(await OriumWrapperManager.getOriginalTokenOf(token2.address)).to.equal(token1.address)

    expect(await OriumWrapperManager.unmapToken(token1.address)).to.not.be.reverted
    expect(await OriumWrapperManager.getWrappedTokenOf(token1.address)).to.equal(AddressZero)
    expect(await OriumWrapperManager.getOriginalTokenOf(token2.address)).to.equal(AddressZero)
  })

  it('should set and get max duration', async () => {
    const maxDuration = 1000
    expect(await OriumWrapperManager.setMaxDuration(token1.address, maxDuration)).to.not.be.reverted
    expect(await OriumWrapperManager.getMaxDurationOf(token1.address)).to.equal(maxDuration)
  })
})
