import { GrantRoleData, Commitment } from '../types'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'ethers'
import { ISftRolesRegistry__factory } from '../../../typechain-types'
import { ICommitTokensAndGrantRoleExtension__factory } from '../../../typechain-types'
import { IRoleBalanceOfExtension__factory } from '../../../typechain-types'
import { ONE_DAY, ROLE, generateRandomInt, generateErc165InterfaceId } from '../../helpers'

const { HashZero, AddressZero } = ethers.constants

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
  role = ROLE,
  grantee = AddressZero,
  expirationDate = null,
  revocable = true,
  data = HashZero,
}): Promise<GrantRoleData> {
  return {
    commitmentId,
    role,
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
