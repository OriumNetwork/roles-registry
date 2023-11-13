import { solidityKeccak256 } from 'ethers/lib/utils'
import { RevokeRoleData, RoleAssignment } from './types'
import { generateRandomInt } from '../helpers'
import { ethers } from 'hardhat'
import { utils } from 'ethers'
import { time } from '@nomicfoundation/hardhat-network-helpers'

const { HashZero, AddressZero } = ethers.constants
export const ONE_DAY = 60 * 60 * 24

export async function buildRoleAssignment({
  // default values
  nonce = generateRandomInt(),
  role = 'Role()',
  tokenAddress = AddressZero,
  tokenId = generateRandomInt(),
  tokenAmount = generateRandomInt(),
  grantor = AddressZero,
  grantee = AddressZero,
  expirationDate = null,
  revocable = true,
  data = HashZero,
}: {
  // types
  nonce?: number
  role?: string
  tokenAddress?: string
  tokenId?: number
  tokenAmount?: number
  grantor?: string
  grantee?: string
  expirationDate?: number | null
  revocable?: boolean
  data?: string
} = {}): Promise<RoleAssignment> {
  return {
    nonce,
    role: generateRoleId(role),
    tokenAddress,
    tokenId,
    tokenAmount,
    grantor,
    grantee,
    expirationDate: expirationDate ? expirationDate : (await time.latest()) + ONE_DAY,
    revocable,
    data,
  }
}

export function buildRevokeRoleData(roleAssignment: RoleAssignment): RevokeRoleData {
  return {
    nonce: roleAssignment.nonce,
    role: roleAssignment.role,
    tokenAddress: roleAssignment.tokenAddress,
    tokenId: roleAssignment.tokenId,
    revoker: roleAssignment.grantor,
    grantee: roleAssignment.grantee,
  }
}

export function generateRoleId(role: string) {
  return solidityKeccak256(['string'], [role])
}

export function getInterfaceID(contractInterface: utils.Interface) {
  let interfaceID = ethers.constants.Zero
  const functions: string[] = Object.keys(contractInterface.functions)
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]))
  }
  return interfaceID
}
