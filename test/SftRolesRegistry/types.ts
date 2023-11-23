export interface RoleAssignment {
  depositId: number
  role: string
  tokenAddress: string
  tokenId: number
  tokenAmount: number
  grantor: string
  grantee: string
  expirationDate: number
  revocable: boolean
  data: string
}

export interface RevokeRoleData {
  depositId: number
  role: string
  tokenAddress: string
  tokenId: number
  revoker: string
  grantee: string
}
