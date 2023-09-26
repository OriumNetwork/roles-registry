import hre, { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ERC7432InterfaceId } from './contants'
import nock from 'nock'
import axios from 'axios'
import { defaultAbiCoder, solidityKeccak256 } from 'ethers/lib/utils'
import { NftMetadata, Role } from './types'

const { HashZero } = ethers.constants
const ONE_DAY = 60 * 60 * 24

describe('RolesRegistry', () => {
  let RolesRegistry: Contract
  let mockERC721: Contract

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let grantor: SignerWithAddress
  let userOne: SignerWithAddress
  let userTwo: SignerWithAddress
  let operator: SignerWithAddress

  const PROPERTY_MANAGER = solidityKeccak256(['string'], ['PROPERTY_MANAGER'])
  const PROPERTY_TENANT = solidityKeccak256(['string'], ['PROPERTY_TENANT'])

  const tokenId = 1
  const revocable = true

  before(async function () {
    // prettier-ignore
    [deployer, grantor, userOne, userTwo, operator] = await ethers.getSigners()

    const metadata: NftMetadata = {
      name: 'Nft name',
      description: 'Nft description',
      roles: [
        {
          name: 'PROPERTY_MANAGER',
          description: 'Property Manager',
          isUnique: false,
          inputs: [
            {
              name: 'profitSplit',
              type: 'tuple[]',
              components: [
                {
                  name: 'eventId',
                  type: 'uint256',
                },
                {
                  name: 'split',
                  type: 'uint256[]',
                },
              ],
            },
          ],
        },
        {
          name: 'PROPERTY_TENANT',
          description: 'Property Tenant',
          isUnique: true,
          inputs: [
            {
              name: 'rentalCost',
              type: 'uint256',
            },
          ],
        },
      ],
    }

    nock('https://example.com').persist().get(`/${tokenId}`).reply(200, metadata)
  })

  beforeEach(async () => {
    const RolesRegistryFactory = await ethers.getContractFactory('RolesRegistry')
    RolesRegistry = await RolesRegistryFactory.deploy()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy()
    await mockERC721.deployed()

    await mockERC721.mint(grantor.address, tokenId)
  })

  describe('Main Functions', async () => {
    let expirationDate: number
    const data = HashZero
    let nftMetadata: NftMetadata

    beforeEach(async () => {
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)
      expirationDate = block.timestamp + ONE_DAY

      const tokenURI = await mockERC721.tokenURI(tokenId)
      const response = await axios.get(tokenURI)
      nftMetadata = response.data
    })

    describe('Grant role', async () => {
      it('should grant role for ERC721', async () => {
        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userOne.address,
            expirationDate,
            revocable,
            data,
          ),
        )
          .to.emit(RolesRegistry, 'RoleGranted')
          .withArgs(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            grantor.address,
            userOne.address,
            expirationDate,
            revocable,
            data,
          )
      })
      it('should NOT grant role if expiration date is in the past', async () => {
        const blockNumber = await hre.ethers.provider.getBlockNumber()
        const block = await hre.ethers.provider.getBlock(blockNumber)
        const expirationDateInThePast = block.timestamp - ONE_DAY

        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userOne.address,
            expirationDateInThePast,
            revocable,
            HashZero,
          ),
        ).to.be.revertedWith('RolesRegistry: expiration date must be in the future')
      })
      it('should NOT grant role if caller is not the token owner', async () => {
        await expect(
          RolesRegistry.connect(userOne).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userOne.address,
            expirationDate,
            revocable,
            HashZero,
          ),
        ).to.be.revertedWith(`RolesRegistry: account must be token owner`)
      })
      it.skip('should NOT grant role if token is neither ERC721 nor ERC1155', async () => {
        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            deployer.address,
            tokenId,
            userOne.address,
            expirationDate,
            revocable,
            HashZero,
          ),
        ).to.be.revertedWith(`RolesRegistry: token address is not ERC1155 or ERC721`)
      })
    })

    describe('Revoke role', async () => {
      beforeEach(async () => {
        await RolesRegistry.connect(grantor).grantRole(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          userOne.address,
          expirationDate,
          revocable,
          data,
        )
      })
      it('should revoke role', async () => {
        await expect(
          RolesRegistry.connect(grantor).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, userOne.address),
        )
          .to.emit(RolesRegistry, 'RoleRevoked')
          .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
      })
      it('should revoke role if caller is the grantee', async () => {
        await expect(
          RolesRegistry.connect(grantor).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, userOne.address),
        )
          .to.emit(RolesRegistry, 'RoleRevoked')
          .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
      })
      it('should revoke role if role is not revocable, but grantor is also the grantee', async () => {
        await RolesRegistry.connect(grantor).grantRole(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          grantor.address,
          expirationDate,
          false,
          data,
        )
        await expect(
          RolesRegistry.connect(grantor).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address),
        )
          .to.emit(RolesRegistry, 'RoleRevoked')
          .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, grantor.address)
        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, grantor.address),
        ).to.be.equal(false)
      })
      it('should NOT revoke role if role is not revocable', async () => {
        await RolesRegistry.connect(grantor).grantRole(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          userOne.address,
          expirationDate,
          false,
          data,
        )
        await expect(
          RolesRegistry.connect(grantor).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, userOne.address),
        ).to.be.revertedWith(`RolesRegistry: Role is not revocable or caller is not the grantee`)
      })
      it('should NOT revoke role if caller is not the token owner', async () => {
        await expect(
          RolesRegistry.connect(userOne).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, userOne.address),
        ).to.be.revertedWith(`RolesRegistry: account must be token owner`)
      })
    })

    describe('Has role', async () => {
      beforeEach(async () => {
        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userOne.address,
            expirationDate,
            revocable,
            HashZero,
          ),
        )
          .to.emit(RolesRegistry, 'RoleGranted')
          .withArgs(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            grantor.address,
            userOne.address,
            expirationDate,
            revocable,
            HashZero,
          )

        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userTwo.address,
            expirationDate,
            revocable,
            HashZero,
          ),
        )
          .to.emit(RolesRegistry, 'RoleGranted')
          .withArgs(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            grantor.address,
            userTwo.address,
            expirationDate,
            revocable,
            HashZero,
          )
      })

      describe('Unique Roles', async () => {
        it('should return true for the last user granted, and false for the others', async () => {
          expect(
            await RolesRegistry.hasUniqueRole(
              PROPERTY_MANAGER,
              mockERC721.address,
              tokenId,
              grantor.address,
              userOne.address,
            ),
          ).to.be.equal(false)

          expect(
            await RolesRegistry.hasUniqueRole(
              PROPERTY_MANAGER,
              mockERC721.address,
              tokenId,
              grantor.address,
              userTwo.address,
            ),
          ).to.be.equal(true)
        })
        it('should NOT return true for the last user if role is expired', async () => {
          await hre.ethers.provider.send('evm_increaseTime', [ONE_DAY + 1])
          await hre.ethers.provider.send('evm_mine', [])

          expect(
            await RolesRegistry.hasUniqueRole(
              PROPERTY_MANAGER,
              mockERC721.address,
              tokenId,
              grantor.address,
              userOne.address,
            ),
          ).to.be.equal(false)
        })
      })

      describe('Non-Unique Roles', async () => {
        it('should return true for all users', async () => {
          expect(
            await RolesRegistry.hasRole(
              PROPERTY_MANAGER,
              mockERC721.address,
              tokenId,
              grantor.address,
              userOne.address,
            ),
          ).to.be.equal(true)

          expect(
            await RolesRegistry.hasRole(
              PROPERTY_MANAGER,
              mockERC721.address,
              tokenId,
              grantor.address,
              userTwo.address,
            ),
          ).to.be.equal(true)
        })
        it("should NOT return true for all users if role is expired'", async () => {
          await hre.ethers.provider.send('evm_increaseTime', [ONE_DAY + 1])
          await hre.ethers.provider.send('evm_mine', [])

          expect(
            await RolesRegistry.hasRole(PROPERTY_TENANT, mockERC721.address, tokenId, grantor.address, userOne.address),
          ).to.be.equal(false)

          expect(
            await RolesRegistry.hasRole(PROPERTY_TENANT, mockERC721.address, tokenId, grantor.address, userTwo.address),
          ).to.be.equal(false)
        })
      })
    })

    describe('Role Data', async () => {
      it('should grant PROPERTY_MANAGER with customData and decode tuple with nftMetadata correctly', async () => {
        //Encode profit split data
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

        await expect(
          RolesRegistry.connect(grantor).grantRole(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userOne.address,
            expirationDate,
            revocable,
            customData,
          ),
        )
          .to.emit(RolesRegistry, 'RoleGranted')
          .withArgs(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            grantor.address,
            userOne.address,
            expirationDate,
            revocable,
            customData,
          )

        const returnedData = await RolesRegistry.roleData(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          grantor.address,
          userOne.address,
        )

        const returnedExpirationDate = await RolesRegistry.roleExpirationDate(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          grantor.address,
          userOne.address,
        )

        expect(returnedExpirationDate).to.equal(expirationDate)
        expect(returnedData).to.equal(customData)

        const propertyManagerRole = nftMetadata.roles.find((role: Role) => role.name === 'PROPERTY_MANAGER')
        const inputs = propertyManagerRole?.inputs[0].components
        const returnDataDecoded = defaultAbiCoder.decode(
          [`(${inputs?.map(input => `${input.type} ${input.name}`)})[]`],
          returnedData,
        )
        returnDataDecoded.map((data: any) => {
          data.map((returnedStruct: any, index: number) => {
            expect(returnedStruct.eventId).to.deep.equal(profitSplit[index].eventId)
            expect(returnedStruct.split).to.deep.equal(profitSplit[index].split)
          })
        })
      })
      it('should grant PROPERTY_TENANT with customData and decode tuple with nftMetadata correctly', async () => {
        // Encode rentalCost data
        const rentalCost = ethers.utils.parseEther('1.5')
        const customData = defaultAbiCoder.encode(['uint256'], [rentalCost])

        await RolesRegistry.connect(grantor).grantRole(
          PROPERTY_TENANT,
          mockERC721.address,
          tokenId,
          userOne.address,
          expirationDate,
          revocable,
          customData,
        )

        const returnedData = await RolesRegistry.roleData(
          PROPERTY_TENANT,
          mockERC721.address,
          tokenId,
          grantor.address,
          userOne.address,
        )

        const tenantRole = nftMetadata.roles.find((role: Role) => role.name === 'PROPERTY_TENANT')
        const decodedData = defaultAbiCoder.decode([`${tenantRole!.inputs.map(input => input.type)}`], returnedData)

        expect(returnedData).to.equal(customData)
        expect(decodedData[0]).to.deep.equal(rentalCost)
      })
    })

    describe('ERC165', async function () {
      it(`should return true for IERC7432 interface id (${ERC7432InterfaceId})`, async function () {
        expect(await RolesRegistry.supportsInterface(ERC7432InterfaceId)).to.be.true
      })
    })

    describe('Approvals', async () => {
      const approvals = ['Approval for TokenId', 'Approval for All']
      for (const approval of approvals) {
        describe(approval, async () => {
          beforeEach(async () => {
            if (approval === 'Approval for TokenId') {
              await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, true)
            } else {
              await RolesRegistry.connect(grantor).setRoleApprovalForAll(mockERC721.address, operator.address, true)
            }
          })
          describe('Grant role from', async () => {
            it('should grant role from', async () => {
              await expect(
                RolesRegistry.connect(operator).grantRoleFrom(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  revocable,
                  HashZero,
                ),
              )
                .to.emit(RolesRegistry, 'RoleGranted')
                .withArgs(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  revocable,
                  HashZero,
                )
            })
            it('should NOT grant role from if operator is not approved', async () => {
              if (approval === 'Approval for TokenId') {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, false)
              } else {
                await RolesRegistry.connect(grantor).setRoleApprovalForAll(mockERC721.address, operator.address, false)
              }

              await expect(
                RolesRegistry.connect(operator).grantRoleFrom(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  revocable,
                  HashZero,
                ),
              ).to.be.revertedWith('RolesRegistry: sender must be token owner or approved')
            })
            it('should NOT grant role from if grantor is not the token owner', async () => {
              await mockERC721.connect(grantor).transferFrom(grantor.address, userOne.address, tokenId)
              await expect(
                RolesRegistry.connect(operator).grantRoleFrom(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  revocable,
                  HashZero,
                ),
              ).to.be.revertedWith(`RolesRegistry: account must be token owner`)
            })
          })

          describe('Revoke role from', async () => {
            describe('Revocable roles', async () => {
              beforeEach(async () => {
                await RolesRegistry.connect(operator).grantRoleFrom(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  revocable,
                  HashZero,
                )
              })
              it('should revoke role from', async () => {
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
              })
              it('should revoke role from if operator is only approved by grantee', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, false)
                await RolesRegistry.connect(userOne).approveRole(mockERC721.address, tokenId, operator.address, true)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(false)
              })
              it('should revoke role from if operator is approved by both grantor and grantee', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, true)
                await RolesRegistry.connect(userOne).approveRole(mockERC721.address, tokenId, operator.address, true)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(false)
              })
              it('should revoke role from if operator is only approved by grantor', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, true)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(false)
              })
              it('should NOT revoke role from if operator is not approved', async () => {
                if (approval === 'Approval for TokenId') {
                  await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, false)
                } else {
                  await RolesRegistry.connect(grantor).setRoleApprovalForAll(
                    mockERC721.address,
                    operator.address,
                    false,
                  )
                }
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.revertedWith('RolesRegistry: sender must be approved')
              })
              it('should NOT revoke role from if revoker is not the token owner', async () => {
                await mockERC721.connect(grantor).transferFrom(grantor.address, userOne.address, tokenId)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.revertedWith(`RolesRegistry: account must be token owner`)
              })
            })
            describe('Non-Revocable roles', async () => {
              beforeEach(async () => {
                await RolesRegistry.connect(operator).grantRoleFrom(
                  PROPERTY_MANAGER,
                  mockERC721.address,
                  tokenId,
                  grantor.address,
                  userOne.address,
                  expirationDate,
                  !revocable,
                  HashZero,
                )
              })
              it('should revoke role from if operator is only approved by grantee', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, false)
                await RolesRegistry.connect(userOne).approveRole(mockERC721.address, tokenId, operator.address, true)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(false)
              })
              it('should revoke role from if operator is approved by both grantor and grantee', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, true)
                await RolesRegistry.connect(userOne).approveRole(mockERC721.address, tokenId, operator.address, true)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                )
                  .to.emit(RolesRegistry, 'RoleRevoked')
                  .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userOne.address)
                expect(
                  await RolesRegistry.hasRole(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.equal(false)
              })
              it('should NOT revoke role from if operator is only approved by grantor', async () => {
                await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, operator.address, true)
                await expect(
                  RolesRegistry.connect(operator).revokeRoleFrom(
                    PROPERTY_MANAGER,
                    mockERC721.address,
                    tokenId,
                    grantor.address,
                    userOne.address,
                  ),
                ).to.be.revertedWith(`RolesRegistry: Role is not revocable or caller is not the grantee`)
              })
            })
          })
        })
      }
    })

    describe('Transfers', async function () {
      beforeEach(async function () {
        await RolesRegistry.connect(grantor).grantRole(
          PROPERTY_MANAGER,
          mockERC721.address,
          tokenId,
          userTwo.address,
          expirationDate,
          revocable,
          HashZero,
        )

        await mockERC721.connect(grantor).transferFrom(grantor.address, userTwo.address, tokenId)
      })
      it('Should keep the role when transferring the NFT', async function () {
        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userTwo.address),
        ).to.be.equal(true)
      })
      it('Should revoke the role after transferring the NFT', async function () {
        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userTwo.address),
        ).to.be.equal(true)

        await RolesRegistry.connect(userTwo).revokeRole(PROPERTY_MANAGER, mockERC721.address, tokenId, userTwo.address)

        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userTwo.address),
        ).to.be.equal(false)
      })
      it('Should NOT revoke role from if operator is only approved by previous NFT owner', async () => {
        await RolesRegistry.connect(grantor).approveRole(mockERC721.address, tokenId, userOne.address, true)
        await expect(
          RolesRegistry.connect(userOne).revokeRoleFrom(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            grantor.address,
            userTwo.address,
          ),
        ).to.be.revertedWith(`RolesRegistry: account must be token owner`)
      })
      it('Should revoke role from if operator is approved by grantee', async () => {
        await RolesRegistry.connect(userTwo).approveRole(mockERC721.address, tokenId, userOne.address, true)
        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userTwo.address),
        ).to.be.equal(true)
        await expect(
          RolesRegistry.connect(userOne).revokeRoleFrom(
            PROPERTY_MANAGER,
            mockERC721.address,
            tokenId,
            userTwo.address,
            userTwo.address,
          ),
        )
          .to.emit(RolesRegistry, 'RoleRevoked')
          .withArgs(PROPERTY_MANAGER, mockERC721.address, tokenId, userTwo.address, userTwo.address)
        expect(
          await RolesRegistry.hasRole(PROPERTY_MANAGER, mockERC721.address, tokenId, grantor.address, userTwo.address),
        ).to.be.equal(false)
      })
    })
  })
})
