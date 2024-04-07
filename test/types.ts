export interface Role {
  tokenAddress: string
  tokenId: number
  roleId: string
  grantee: string
  expirationDate: number
  revocable: boolean
  data: string
}
