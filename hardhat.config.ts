import * as dotenv from 'dotenv'
import 'solidity-coverage'
import 'hardhat-gas-reporter'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-upgrades'
import 'hardhat-spdx-license-identifier'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-defender'
// import '@nomicfoundation/hardhat-foundry'

dotenv.config()

const {
  ENVIRONMENT,
  COINMARKETCAP_API_KEY,
  DEV_PRIVATE_KEY,
  PROD_PRIVATE_KEY,
  DEFENDER_TEAM_API_KEY,
  DEFENDER_TEAM_API_SECRET_KEY,
  POLYGONSCAN_API_KEY,
  ETHER_SCAN_API_KEY,
  POLYGON_PROVIDER_URL,
  SEPOLIA_TESTNET_PROVIDER_URL,
  CRONOS_TESTNET_PROVIDER_URL,
  MOONBEAM_PROVIDER_URL,
  CRONOS_PROVIDER_URL,
  CRONOSSCAN_API_KEY,
  MOONSCAN_API_KEY,
} = process.env

const BASE_CONFIG = {
  solidity: {
    compilers: [
      {
        version: '0.8.9',
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
      {
        version: '0.5.10',
        settings: {
          optimizer: {
            enabled: true,
            runs: 99999,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 840000,
  },
  gasReporter: {
    enabled: true,
    excludeContracts: ['contracts/test'],
    gasPrice: 100,
    token: 'MATIC',
    currency: 'USD',
    coinmarketcap: COINMARKETCAP_API_KEY,
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      sepolia: ETHER_SCAN_API_KEY,
      cronosTestnet: CRONOSSCAN_API_KEY,
      cronos: CRONOSSCAN_API_KEY,
      moonbeam: MOONSCAN_API_KEY,
    },
    customChains: [
      {
        network: 'cronosTestnet',
        chainId: 338,
        urls: {
          apiURL: 'https://cronos.org/explorer/testnet3/api',
          blockExplorerURL: 'https://cronos.org/explorer/testnet3',
        },
      },
      {
        network: 'cronos',
        chainId: 25,
        urls: {
          apiURL: 'https://cronos.org/explorer/api',
          blockExplorerURL: 'https://cronos.org/explorer',
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: POLYGON_PROVIDER_URL,
        blockNumber: 45752368,
      },
    },
  },
}

const PROD_CONFIG = {
  ...BASE_CONFIG,
  defender: {
    apiKey: DEFENDER_TEAM_API_KEY,
    apiSecret: DEFENDER_TEAM_API_SECRET_KEY,
  },
  networks: {
    hardhat: {
      forking: {
        url: POLYGON_PROVIDER_URL,
        blockNumber: 45752368,
      },
    },
    polygon: {
      chainId: 137,
      url: POLYGON_PROVIDER_URL,
      accounts: [PROD_PRIVATE_KEY],
    },
    cronos: {
      chainId: 25,
      url: CRONOS_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    cronosTestnet: {
      chainId: 338,
      url: CRONOS_TESTNET_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    sepoliaTestnet: {
      chainId: 11155111,
      url: SEPOLIA_TESTNET_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    moonbeam: {
      chainId: 1284,
      url: MOONBEAM_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
  },
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = ENVIRONMENT === 'prod' ? PROD_CONFIG : BASE_CONFIG
