import { buildGrantRole, buildCommitment } from './mockData'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

export async function assertCreateCommitmentEvent(
  SftRolesRegistry: Contract,
  MockToken: Contract,
  grantor: SignerWithAddress,
  expectedcommitmentId: number,
  anotherUser?: SignerWithAddress,
) {
  const commitment = buildCommitment({
    grantor: grantor.address,
    tokenAddress: MockToken.address,
  })
  await MockToken.mint(grantor.address, commitment.tokenId, commitment.tokenAmount)
  await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)

  if (anotherUser) {
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(commitment.tokenAddress, anotherUser.address, true)
  }

  await expect(
    SftRolesRegistry.connect(anotherUser || grantor).commitTokens(
      commitment.grantor,
      commitment.tokenAddress,
      commitment.tokenId,
      commitment.tokenAmount,
    ),
  )
    .to.emit(SftRolesRegistry, 'TokensCommitted')
    .withArgs(
      commitment.grantor,
      expectedcommitmentId,
      commitment.tokenAddress,
      commitment.tokenId,
      commitment.tokenAmount,
    )
    .to.emit(MockToken, 'TransferSingle')
    .withArgs(
      SftRolesRegistry.address,
      grantor.address,
      SftRolesRegistry.address,
      commitment.tokenId,
      commitment.tokenAmount,
    )
  return { ...commitment, commitmentId: expectedcommitmentId }
}

export async function assertGrantRoleEvent(
  SftRolesRegistry: Contract,
  grantor: SignerWithAddress,
  commitmentId: number,
  grantee: string,
  revocable = true,
  anotherUser?: SignerWithAddress,
) {
  const grantRoleData = await buildGrantRole({
    commitmentId,
    grantee,
    revocable,
  })
  if (anotherUser) {
    const tokenAddress = await SftRolesRegistry.tokenAddressOf(commitmentId)
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(tokenAddress, anotherUser.address, true)
  }
  await expect(
    SftRolesRegistry.connect(anotherUser || grantor).grantRole(
      commitmentId,
      grantRoleData.role,
      grantee,
      grantRoleData.expirationDate,
      grantRoleData.revocable,
      grantRoleData.data,
    ),
  )
    .to.emit(SftRolesRegistry, 'RoleGranted')
    .withArgs(
      commitmentId,
      grantRoleData.role,
      grantee,
      grantRoleData.expirationDate,
      grantRoleData.revocable,
      grantRoleData.data,
    )
  return grantRoleData
}

export async function assertRevokeRoleEvent(
  SftRolesRegistry: Contract,
  grantor: SignerWithAddress,
  commitmentId: number,
  role: string,
  grantee: SignerWithAddress,
  revoker?: SignerWithAddress,
) {
  if (revoker) {
    const tokenAddress = await SftRolesRegistry.tokenAddressOf(commitmentId)
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(tokenAddress, revoker.address, true)
  }
  await expect(SftRolesRegistry.connect(revoker || grantor).revokeRole(commitmentId, role, grantee.address))
    .to.emit(SftRolesRegistry, 'RoleRevoked')
    .withArgs(commitmentId, role, grantee.address)
  return { commitmentId, role, grantee: grantee.address }
}
