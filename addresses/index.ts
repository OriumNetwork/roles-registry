import sepoliaTestnet from './sepoliaTestnet/index.json'
import moonbeam from './moonbeam/index.json'

const config = {
  sepoliaTestnet,
  moonbeam,
}

export default config

export type Network = keyof typeof config
