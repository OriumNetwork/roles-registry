import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name
const CONTRACT_NAME = 'SftRolesRegistrySingleRole'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const signer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const operator = await signer.getAddress()
  console.log(`Deploying ${CONTRACT_NAME} contract on: ${NETWORK} network with ${operator}`)

  const ContractFactory = await ethers.getContractFactory(CONTRACT_NAME)
  const contract = await ContractFactory.deploy()
  await contract.deployed()

  console.log(`${CONTRACT_NAME} deployed at: ${contract.address}`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
