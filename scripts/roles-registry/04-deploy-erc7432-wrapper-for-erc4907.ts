import { ethers, network, upgrades } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { updateJsonFile } from '../../utils/json'
import { confirmOrDie, print, colors } from '../../utils/misc'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name
const IMMUTABLE_CONTRACT_NAME = 'ERC7432WrapperForERC4907'
const UPGRADABLE_CONTRACT_NAME = 'OriumWrapperManager'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')

const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()

  /** Deploy OriumWrapperManager **/

  await confirmOrDie(
    `Deploying ${UPGRADABLE_CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`,
  )
  const ContractFactory = await ethers.getContractFactory(UPGRADABLE_CONTRACT_NAME, { signer: deployer })
  const INITIALIZER_ARGUMENTS = [deployerAddress, ethers.constants.AddressZero]
  const contract = await upgrades.deployProxy(ContractFactory, INITIALIZER_ARGUMENTS)
  await contract.deployed()
  print(colors.success, `${UPGRADABLE_CONTRACT_NAME} deployed to: ${contract.address}`)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [UPGRADABLE_CONTRACT_NAME]: {
      address: contract.address,
      operator: deployerAddress,
      implementation: await upgrades.erc1967.getImplementationAddress(contract.address),
      proxyAdmin: await upgrades.erc1967.getAdminAddress(contract.address),
    },
  }

  console.log('deploymentInfo', deploymentInfo)

  updateJsonFile(`addresses/${NETWORK}/index.json`, deploymentInfo)

  print(colors.success, 'Config files updated!')

  /** Deploy ERC7432WrapperForERC4907 **/

  await confirmOrDie(
    `Deploying ${IMMUTABLE_CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`,
  )

  const ERC7432WrapperForERC4907Factory = await ethers.getContractFactory(IMMUTABLE_CONTRACT_NAME, { signer: deployer })
  const ERC7432WrapperForERC4907 = await ERC7432WrapperForERC4907Factory.deploy(contract.address)
  await ERC7432WrapperForERC4907.deployed()

  console.log(`${IMMUTABLE_CONTRACT_NAME} deployed at: ${ERC7432WrapperForERC4907.address}`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
