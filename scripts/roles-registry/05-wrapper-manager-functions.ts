import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { confirmOrDie, print, colors } from '../../utils/misc'
import config, { Network } from '../../addresses'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const ContractName = 'OriumWrapperManager'
const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const NETWORK = network.name as Network
  const deployerAddress = await deployer.getAddress()
  const WrapperManagerAddress = config[NETWORK][ContractName].address
  const WrapperManager = await ethers.getContractAt(ContractName, WrapperManagerAddress, deployer)

  let tx
  await confirmOrDie(
    `Updating ${ContractName} on ${NETWORK} [${WrapperManagerAddress}] with deployer ${deployerAddress}. Continue?`,
  )

  print(colors.highlight, 'Updating marketplace address...')
  const marketplaceAddress = ''
  tx = await WrapperManager.setMarketplaceAddress(marketplaceAddress)
  await tx.wait()
  print(colors.success, `Updated marketplace address ${marketplaceAddress}`)

  print(colors.highlight, 'Deleting token mapping...')
  const tokenToUnmap = '0xcb13945ca8104f813992e4315f8ffefe64ac49ca'
  tx = await WrapperManager.unmapToken(tokenToUnmap)
  await tx.wait()
  print(colors.success, `Deleted token mapping for ${tokenToUnmap}: ${tx.hash}`)

  print(colors.highlight, 'Updating token mapping...')
  const tokenAddress = '0xcb13945ca8104f813992e4315f8ffefe64ac49ca'
  const wrapperTokenAddress = '0xB7fdD27a8Df011816205a6e3cAA097DC4D8C2C5d'
  tx = await WrapperManager.mapToken(tokenAddress, wrapperTokenAddress)
  await tx.wait()
  print(colors.success, `Updated token ${tokenAddress} with wrapper ${wrapperTokenAddress}: ${tx.hash}`)

  print(colors.highlight, 'Updating max duration...')
  const tokenToUpdate = '0xcb13945ca8104f813992e4315f8ffefe64ac49ca'
  const maxDuration = 60 * 60 * 24 * 30 * 3 // 3 months
  tx = await WrapperManager.setMaxDuration(tokenToUpdate, maxDuration)
  await tx.wait()
  print(colors.success, `Updated token ${tokenAddress} with wrapper ${wrapperTokenAddress}`)
}

main()
  .then(async () => {
    console.log('All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
