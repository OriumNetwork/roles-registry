import { time } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'ethers'
import { ONE_DAY, generateRandomInt, generateRoleId, ROLE } from '../helpers'
import { Role } from '../types'

const { HashZero, AddressZero } = ethers.constants

export async function buildRole({
  roleId = ROLE,
  tokenAddress = AddressZero,
  tokenId = generateRandomInt(),
  recipient = AddressZero,
  expirationDate = 0,
  revocable = true,
  data = HashZero,
}): Promise<Role> {
  return {
    roleId: generateRoleId(roleId),
    tokenAddress: ethers.utils.getAddress(tokenAddress),
    tokenId,
    recipient,
    expirationDate: expirationDate ? expirationDate : (await time.latest()) + ONE_DAY,
    revocable,
    data,
  }
}

export async function getExpiredDate(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const block = await require('hardhat').ethers.provider.getBlock('latest')
  return block.timestamp - 1
}
