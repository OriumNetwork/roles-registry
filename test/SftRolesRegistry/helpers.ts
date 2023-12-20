import { solidityKeccak256 } from 'ethers/lib/utils'
import { GrantRoleData, Record } from './types'
import { generateRandomInt } from '../helpers'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const { HashZero, AddressZero } = ethers.constants
export const ONE_DAY = 60 * 60 * 24

export function buildRecord({
  grantor = AddressZero,
  tokenAddress = AddressZero,
  tokenId = generateRandomInt(),
  tokenAmount = generateRandomInt(),
}): Record {
  return { grantor, tokenAddress, tokenId, tokenAmount }
}

export async function buildGrantRole({
  recordId = generateRandomInt(),
  role = 'UNIQUE_ROLE',
  grantee = AddressZero,
  expirationDate = null,
  revocable = true,
  data = HashZero,
}): Promise<GrantRoleData> {
  return {
    recordId,
    role: generateRoleId(role),
    grantee,
    expirationDate: expirationDate ? expirationDate : (await time.latest()) + ONE_DAY,
    revocable,
    data,
  }
}

export function generateRoleId(role: string) {
  return solidityKeccak256(['string'], [role])
}
