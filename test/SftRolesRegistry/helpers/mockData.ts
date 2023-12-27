import { solidityKeccak256 } from 'ethers/lib/utils'
import { GrantRoleData, Commitment, RoleAssignment } from '../types'
import { generateRandomInt } from '../../helpers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'ethers'
import { ISftRolesRegistry__factory } from '../../../typechain-types'
import { ICommitTokensAndGrantRoleExtension__factory } from '../../../typechain-types'
import { IRoleBalanceOfExtension__factory } from '../../../typechain-types'

const { HashZero, AddressZero } = ethers.constants
export const ONE_DAY = 60 * 60 * 24

export function buildCommitment({
  grantor = AddressZero,
  tokenAddress = AddressZero,
  tokenId = generateRandomInt(),
  tokenAmount = generateRandomInt(),
}): Commitment {
  return { grantor, tokenAddress, tokenId, tokenAmount }
}

export async function buildGrantRole({
  commitmentId = generateRandomInt(),
  role = 'UNIQUE_ROLE',
  grantee = AddressZero,
  expirationDate = null,
  revocable = true,
  data = HashZero,
}): Promise<GrantRoleData> {
  return {
    commitmentId,
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

export async function buildRoleAssignment({
  // default values
  nonce = generateRandomInt(),
  role = 'UNIQUE_ROLE',
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

export function getSftRolesRegistryInterfaceId() {
  const iface = ISftRolesRegistry__factory.createInterface()
  return generateErc165InterfaceId(iface)
}

export function getCommitTokensAndGrantRoleInterfaceId() {
  const iface = ICommitTokensAndGrantRoleExtension__factory.createInterface()
  return generateErc165InterfaceId(iface)
}

export function getRoleBalanceOfInterfaceId() {
  const iface = IRoleBalanceOfExtension__factory.createInterface()
  return generateErc165InterfaceId(iface)
}

function generateErc165InterfaceId(contractInterface: ethers.utils.Interface) {
  let interfaceID = ethers.constants.Zero
  const functions: string[] = Object.keys(contractInterface.functions).filter(f => f !== 'supportsInterface(bytes4)')
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]))
  }
  return interfaceID
}
