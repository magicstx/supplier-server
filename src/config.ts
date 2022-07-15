import { ECPair, networks, payments } from 'bitcoinjs-lib';
import { StacksNetworkVersion } from 'micro-stacks/crypto';
import { StacksMainnet, StacksMocknet, StacksNetwork, StacksTestnet } from 'micro-stacks/network';
import { getPublicKey as _getPublicKey } from 'noble-secp256k1';
import { logger } from './logger';
import { bridgeContract, stacksProvider } from './stacks';
import { makeStxAddress } from './utils';

export function getEnv(key: string) {
  const oldKey = key.replace(/^SUPPLIER/, 'OPERATOR');
  const value = process.env[oldKey] || process.env[key];
  if (!value) throw new Error(`Missing required ENV variable: ${key}`);
  return value;
}

export function getBtcSigner() {
  const network = getBtcNetwork();
  return ECPair.fromWIF(getEnv('SUPPLIER_BTC_KEY'), network);
}

export function getBtcPrivateKey() {
  const signer = getBtcSigner();
  if (!signer.privateKey) throw new Error('Invalid private key in SUPPLIER_BTC_KEY');
  return signer.privateKey;
}

export function getPublicKey() {
  const signer = getBtcSigner();
  return signer.publicKey;
}

export function getSupplierId() {
  const id = parseInt(getEnv('SUPPLIER_ID'), 10);
  if (isNaN(id)) throw new Error('SUPPLIER_ID is not a number');
  return id;
}

export function hasSupplierId() {
  return typeof process.env.SUPPLIER_ID !== 'undefined';
}

export function getBtcPayment() {
  const pubkey = getPublicKey();
  const network = getBtcNetwork();
  return payments.p2pkh({ pubkey, network });
}

export function getBtcAddress() {
  const { address } = getBtcPayment();
  if (!address) throw new Error('Expected BTC address from config.');
  return address;
}

export function getStxPrivateKey() {
  return getEnv('SUPPLIER_STX_KEY');
}

export function getStxNetworkVersion() {
  const networkKey = getNetworkKey();
  if (networkKey === 'mainnet') {
    return StacksNetworkVersion.mainnetP2PKH;
  }
  return StacksNetworkVersion.testnetP2PKH;
}

export function getStxAddress() {
  const networkVersion = getStxNetworkVersion();
  return makeStxAddress(getStxPrivateKey(), networkVersion);
}

export function getNetworkKey() {
  return getEnv('SUPPLIER_NETWORK');
}

export function validateKeys() {
  return {
    btcAddress: getBtcAddress(),
    stxAddress: getStxAddress(),
    btcNetwork: getNetworkKey(),
  };
}

// Fetch server config. Will throw an error if missing config.
export function validateConfig() {
  const keys = validateKeys();
  return {
    ...keys,
    operatorId: getSupplierId(),
  };
}

export type PublicConfig = ReturnType<typeof validateConfig>;

export function logConfig(config: Record<string, string | number>) {
  const electrumConfig = getElectrumConfig();
  logger.debug({ ...config, electrumConfig, topic: 'start' }, 'Server config:');
}

export function getBtcNetwork(): networks.Network {
  const networkKey = getNetworkKey();
  switch (networkKey) {
    case 'mocknet':
      return networks.regtest;
    case 'mainnet':
      return networks.bitcoin;
    case 'testnet':
      return networks.testnet;
    default:
      throw new Error(`Invalid SUPPLIER_NETWORK: ${networkKey}`);
  }
}

export function getStxNetwork(): StacksNetwork {
  const networkKey = getNetworkKey();
  switch (networkKey) {
    case 'mocknet':
      return new StacksMocknet();
    case 'mainnet':
      return new StacksMainnet();
    case 'testnet':
      return new StacksTestnet();
    default:
      throw new Error(`Invalid SUPPLIER_NETWORK: ${networkKey}`);
  }
}

export function getElectrumConfig() {
  const networkKey = getNetworkKey();
  const defaultHost = process.env.ELECTRUM_HOST;
  const defaultPort = process.env.ELECTRUM_PORT
    ? parseInt(process.env.ELECTRUM_PORT, 10)
    : undefined;
  const defaultProtocol = process.env.ELECTRUM_PROTOCOL;
  switch (networkKey) {
    case 'testnet':
      return {
        host: defaultHost || 'blackie.c3-soft.com',
        port: defaultPort === undefined ? 57006 : defaultPort,
        protocol: defaultProtocol || 'ssl',
      };
    case 'mocknet':
      return {
        host: 'localhost',
        port: 50001,
        protocol: 'tcp',
      };
    case 'mainnet':
      return {
        host: 'fortress.qtornado.com',
        port: 443,
        protocol: 'ssl',
      };
    default:
      return {
        host: process.env.ELECTRUM_HOST || 'localhost',
        port: parseInt(process.env.ELECTRUM_PORT || '50001', 10),
        protocol: process.env.ELECTRUM_PROTOCOL || 'ssl',
      };
  }
}

export async function validateKeysMatch() {
  const stxAddress = getStxAddress();
  const btcAddress = getBtcAddress();
  let id: number;
  try {
    id = getSupplierId();
  } catch (error) {
    throw new Error('Cannot validate keys match: no supplier id');
  }

  const provider = stacksProvider();
  const supplier = await provider.ro(bridgeContract().getSupplier(id));
  if (supplier === null) throw new Error(`Invalid config: no supplier with id ${id}`);

  if (supplier.controller !== stxAddress) {
    throw new Error(`STX key invalid: expected ${supplier.controller} to equal ${stxAddress}`);
  }

  const supplierBtc = payments.p2pkh({
    pubkey: Buffer.from(supplier.publicKey),
    network: getBtcNetwork(),
  }).address!;
  if (supplierBtc !== btcAddress) {
    throw new Error(`BTC key invalid: expected ${supplierBtc} to equal ${btcAddress}`);
  }
  return true;
}
