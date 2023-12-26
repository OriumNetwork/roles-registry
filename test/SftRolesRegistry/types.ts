export interface Commitment {
  grantor: string
  tokenAddress: string
  tokenId: number
  tokenAmount: number
}

export interface GrantRoleData {
  commitmentId: number
  role: string
  grantee: string
  expirationDate: number
  revocable: boolean
  data: string
}

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
  grantor: string
  grantee: string
}
