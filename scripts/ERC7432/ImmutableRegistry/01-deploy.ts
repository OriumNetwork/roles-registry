import hre, { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { confirmOrDie, print, colors } from '../../../utils/misc'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name
const ERC7432_IMMUTABLE_NAME = 'ERC7432ImmutableRegistry'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')

const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()

  /** Deploy ERC7589RolesRegistry **/

  await confirmOrDie(
    `Deploying ${ERC7432_IMMUTABLE_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`,
  )

  const ERC7432ImmutableRegistryFactory = await ethers.getContractFactory(ERC7432_IMMUTABLE_NAME, { signer: deployer })
  const EERC7432ImmutableRegistry = await ERC7432ImmutableRegistryFactory.deploy()
  await EERC7432ImmutableRegistry.deployed()

  console.log(`${ERC7432_IMMUTABLE_NAME} deployed at: ${EERC7432ImmutableRegistry.address}`)

  print(colors.highlight, `Verifying contract ${ERC7432_IMMUTABLE_NAME} on ${NETWORK}...`)
  await hre.run('verify:verify', {
    address: EERC7432ImmutableRegistry.address
  })
  print(colors.success, `Contract ${ERC7432_IMMUTABLE_NAME} verified!`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
