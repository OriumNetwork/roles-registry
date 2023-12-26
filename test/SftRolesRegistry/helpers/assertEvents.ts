import { buildGrantRole, buildRecord } from './mockData'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

export async function assertCreateRecordEvent(
  SftRolesRegistry: Contract,
  MockToken: Contract,
  grantor: SignerWithAddress,
  expectedRecordId: number,
  anotherUser?: SignerWithAddress,
) {
  const record = buildRecord({
    grantor: grantor.address,
    tokenAddress: MockToken.address,
  })
  await MockToken.mint(grantor.address, record.tokenId, record.tokenAmount)
  await MockToken.connect(grantor).setApprovalForAll(SftRolesRegistry.address, true)

  if (anotherUser) {
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(record.tokenAddress, anotherUser.address, true)
  }

  await expect(
    SftRolesRegistry.connect(anotherUser || grantor).createRecordFrom(
      record.grantor,
      record.tokenAddress,
      record.tokenId,
      record.tokenAmount,
    ),
  )
    .to.emit(SftRolesRegistry, 'RecordCreated')
    .withArgs(record.grantor, expectedRecordId, record.tokenAddress, record.tokenId, record.tokenAmount)
    .to.emit(MockToken, 'TransferSingle')
    .withArgs(SftRolesRegistry.address, grantor.address, SftRolesRegistry.address, record.tokenId, record.tokenAmount)
  return { ...record, recordId: expectedRecordId }
}

export async function assertGrantRoleEvent(
  SftRolesRegistry: Contract,
  grantor: SignerWithAddress,
  recordId: number,
  grantee: string,
  revocable = true,
  anotherUser?: SignerWithAddress,
) {
  const grantRoleData = await buildGrantRole({
    recordId,
    grantee,
    revocable,
  })
  if (anotherUser) {
    const record = await SftRolesRegistry.recordInfo(recordId)
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(record.tokenAddress_, anotherUser.address, true)
  }
  await expect(
    SftRolesRegistry.connect(anotherUser || grantor).grantRole(
      recordId,
      grantRoleData.role,
      grantee,
      grantRoleData.expirationDate,
      grantRoleData.revocable,
      grantRoleData.data,
    ),
  )
    .to.emit(SftRolesRegistry, 'RoleGranted')
    .withArgs(
      recordId,
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
  recordId: number,
  role: string,
  grantee: SignerWithAddress,
  revoker?: SignerWithAddress,
) {
  if (revoker) {
    const record = await SftRolesRegistry.recordInfo(recordId)
    await SftRolesRegistry.connect(grantor).setRoleApprovalForAll(record.tokenAddress_, revoker.address, true)
  }
  await expect(SftRolesRegistry.connect(revoker || grantor).revokeRoleFrom(recordId, role, grantee.address))
    .to.emit(SftRolesRegistry, 'RoleRevoked')
    .withArgs(recordId, role, grantee.address)
  return { recordId, role, grantee: grantee.address }
}
