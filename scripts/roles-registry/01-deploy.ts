import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { DeployAddresses } from '../../config'
import { keccak256 } from 'ethers/lib/utils'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name
const CONTRACT_NAME = 'RolesRegistry'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const signer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const operator = await signer.getAddress()
  console.log(`Deploying ${CONTRACT_NAME} contract on: ${NETWORK} network with ${operator}`)

  const ContractFactory = await ethers.getContractFactory(CONTRACT_NAME)
  const create2Factory = await ethers.getContractAt(
    'IImmutableOwnerCreate2Factory',
    DeployAddresses.ImmutableOwnerCreate2Factory, // This address is the same on all networks
    signer,
  )

  const bytecode = ContractFactory.bytecode
  const salt = '0x00000000000000000000000000000000000000008b99e5a778edb02572010000'

  const computedAddress = await create2Factory.computeAddress(salt, keccak256(bytecode))
  console.log(`${CONTRACT_NAME} will be deployed at: ${computedAddress}`)

  const tx = await create2Factory.deploy(salt, bytecode)
  console.log(`${CONTRACT_NAME} deployment txHash: ${tx.hash}`)

  await tx.wait()

  console.log(`${CONTRACT_NAME} deployed at: ${computedAddress}`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
