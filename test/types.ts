export interface Role {
  tokenAddress: string
  tokenId: number
  roleId: string
  recipient: string
  expirationDate: number
  revocable: boolean
  data: string
}
