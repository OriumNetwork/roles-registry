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
const IMMUTABLE_CONTRACT_NAME = 'ERC7589RolesRegistry'
const MARKETPLACE_CONTRACT = '0xB1D47B09aa6D81d7B00C3A37705a6A157B83C49F'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')

const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()

  /** Deploy ERC7589RolesRegistry **/

  await confirmOrDie(
    `Deploying ${IMMUTABLE_CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`,
  )

  const ERC7589RolesRegistryFactory = await ethers.getContractFactory(IMMUTABLE_CONTRACT_NAME, { signer: deployer })
  const ERC7589RolesRegistry = await ERC7589RolesRegistryFactory.deploy(MARKETPLACE_CONTRACT, {
    gasPrice: ethers.utils.parseUnits('100', 'gwei'),
  })
  await ERC7589RolesRegistry.deployed()

  console.log(`${IMMUTABLE_CONTRACT_NAME} deployed at: ${ERC7589RolesRegistry.address}`)

  print(colors.highlight, `Verifying contract ${IMMUTABLE_CONTRACT_NAME} on ${NETWORK}...`)
  await hre.run('verify:verify', {
    address: ERC7589RolesRegistry.address,
    constructorArguments: [MARKETPLACE_CONTRACT],
  })
  print(colors.success, `Contract ${IMMUTABLE_CONTRACT_NAME} verified!`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
