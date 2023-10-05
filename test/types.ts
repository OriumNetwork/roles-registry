export interface NftMetadata {
  name: string
  description: string
  roles: Role[]
}

export interface Role {
  name: string
  description: string
  isUniqueRole: boolean
  inputs: Input[]
}

export interface Input {
  name: string
  type: string
  components?: Input[]
}

export interface RoleAssignment {
  role: string
  tokenAddress: string
  tokenId: number
  grantor: string
  grantee: string
  expirationDate: number
  data: string
}
