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
