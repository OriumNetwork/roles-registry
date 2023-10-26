import hre, {ethers} from "hardhat";
import {BigNumber, Contract} from "ethers";
import {expect} from "chai";
import {defaultAbiCoder, solidityKeccak256} from "ethers/lib/utils";
const { HashZero } = ethers.constants

const ONE_DAY = 60 * 60 * 24

describe('RolesRegistry1155', async () => {

  const tokenId = 1
  const tokenAmount = BigNumber.from(5)
  const revocable = true
  let expirationDate: number

  let RolesRegistry: Contract
  let mockERC1155: Contract
  let roleAssignment: any  // todo change any

  const [
    deployer,
    grantor,
    userOne,
    userTwo,
    operator,
  ] = await ethers.getSigners()

  beforeEach(async () => {
    const RolesRegistryFactory = await ethers.getContractFactory('RolesRegistry1155')
    RolesRegistry = await RolesRegistryFactory.deploy()

    const MockERC1155Factory = await ethers.getContractFactory('MockERC1155')
    mockERC1155 = await MockERC1155Factory.deploy()
    await mockERC1155.deployed()

    await mockERC1155.mint(grantor.address, tokenId, tokenAmount)
    const blockNumber = await hre.ethers.provider.getBlockNumber()
    const block = await hre.ethers.provider.getBlock(blockNumber)
    expirationDate = block.timestamp + ONE_DAY

    const profitSplit = [
      {
        eventId: 1,
        split: [60, 30, 5, 5],
      },
      {
        eventId: 2,
        split: [50, 50],
      },
    ]
    const customData = defaultAbiCoder.encode(['(uint256 eventId,uint256[] split)[]'], [profitSplit])

    roleAssignment = {
      role: solidityKeccak256(['string'], ['PROPERTY_MANAGER']),
      tokenAddress: mockERC1155.address,
      tokenId: tokenId,
      tokenAmount: tokenAmount,
      grantor: grantor.address,
      grantee: userOne.address,
      expirationDate: expirationDate,
      data: HashZero //customData,
    }

  })

  describe('grantRole', async () => {

    it('should grant role from for ERC1155', async () => {

      // console.log('grantor', grantor.address)
      // const balance = await mockERC1155.balanceOf(grantor.address, tokenId)
      // console.log('balance', balance.toString())

      await mockERC1155.connect(grantor).setApprovalForAll(RolesRegistry.address, true)
      await expect(RolesRegistry.connect(grantor).grantRoleFrom(roleAssignment))
        .to.emit(RolesRegistry, 'RoleGranted')
        // .withArgs(
        //   PROPERTY_MANAGER,
        //   mockERC1155.address,
        //   tokenId,
        //   grantor.address,
        //   userOne.address,
        //   expirationDate,
        //   revocable,
        //   data,
        // )
    })

  })

})