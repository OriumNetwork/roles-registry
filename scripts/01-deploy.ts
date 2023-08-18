import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'

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
    'ImmutableCreate2Factory',
    '0x0000000000FFe8B47B3e2130213B802212439497', // This address is the same on all networks
    signer,
  )

  const bytecode = ContractFactory.bytecode
  const salt = '0x00000000000000000000000000000000000000008b99e5a778edb02572010000'

  const tx = await create2Factory.safeCreate2(salt, bytecode)

  console.log(`${CONTRACT_NAME} deployment txHash: ${tx.hash}`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
