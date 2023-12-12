export interface RoleAssignment {
  nonce: number
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
  nonce: number
  role: string
  tokenAddress: string
  tokenId: number
  revoker: string
  grantee: string
}
