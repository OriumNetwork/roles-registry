import { solidityKeccak256 } from 'ethers/lib/utils'
import { RoleAssignment } from './types'
import { generateRandomInt } from '../helpers'
import { ethers } from 'hardhat'

const { HashZero, AddressZero } = ethers.constants
export const ONE_DAY = 60 * 60 * 24

export function buildRoleAssignment(
  {
    // default values
    nonce = generateRandomInt(),
    role = 'Role()',
    tokenAddress = AddressZero,
    tokenId = generateRandomInt(),
    tokenAmount = generateRandomInt(),
    grantor = AddressZero,
    grantee = AddressZero,
    expirationDate = currentUnixTimestamp() + ONE_DAY,
    revocable = true,
    data = HashZero,
  }: {
    // types
    nonce?: number,
    role?: string,
    tokenAddress?: string,
    tokenId?: number,
    tokenAmount?: number,
    grantor?: string,
    grantee?: string,
    expirationDate?: number,
    revocable?: boolean,
    data?: string,
  } = {}
): RoleAssignment {
  return {
    nonce,
    role: solidityKeccak256(['string'], [role]),
    tokenAddress,
    tokenId,
    tokenAmount,
    grantor,
    grantee,
    expirationDate,
    revocable,
    data,
  }
}

export function currentUnixTimestamp() {
  return Math.floor(Date.now() / 1000)
}
