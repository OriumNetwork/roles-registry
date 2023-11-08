import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { DeployAddresses } from '../../config'
import { RoleAssignment } from '../../test/types'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const FEE_DATA: any = {
  maxFeePerGas: ethers.utils.parseUnits('200', 'gwei'),
  maxPriorityFeePerGas: ethers.utils.parseUnits('5', 'gwei'),
}
provider.getFeeData = async () => FEE_DATA
const kmsSigner = new AwsKmsSigner(kmsCredentials).connect(provider)
const CONTRACT_NAME = 'RolesRegistry'

async function main() {
  const rolesRegistry = await ethers.getContractAt(
    'RolesRegistry',
    DeployAddresses[CONTRACT_NAME], // This address is the same on all networks
    kmsSigner,
  )

  const tokenIds = [217]

  // get hardhat accounts
  const accounts = await ethers.getSigners()
  const granteeAddress = accounts[0].address
  const grantorAddress = await kmsSigner.getAddress()

  const blockTimestamp = (await provider.getBlock('latest')).timestamp
  const ONE_DAY = 60 * 60 * 24
  const expirationDate = blockTimestamp + ONE_DAY
  const ROLE_NAME = 'CHRONOS_PLAYER'

  for (const tokenId of tokenIds) {
    const roleAssignment: RoleAssignment = {
      role: '0x3d926b0dd5f4880fb18c9a49c890c7d76c2a97e0d4b4c20f1bb3fe6e5f89f0f4',
      tokenAddress: '0xa03c4e40d1fcaa826591007a17ca929ef8adbf1c', //Chronos travaler polygon
      tokenId,
      grantor: grantorAddress,
      grantee: grantorAddress,
      expirationDate: expirationDate,
      data: ethers.constants.HashZero,
    }

    const tx = await rolesRegistry.connect(kmsSigner).grantRevocableRoleFrom(roleAssignment)
    console.log(`Granting role ${ROLE_NAME} for token ${tokenId} txHash: ${tx.hash}`)
    await tx.wait()
    console.log(`Role ${ROLE_NAME} granted for token ${tokenId} txHash: ${tx.hash}`)
  }
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
