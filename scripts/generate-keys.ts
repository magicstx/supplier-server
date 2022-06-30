import { utils } from 'noble-secp256k1';
import { ECPair, payments } from 'bitcoinjs-lib';
import { getBtcNetwork, getStxNetworkVersion } from '../src/config';
import { bytesToHex } from 'micro-stacks/common';
import { makeStxAddress } from '../src/utils';
import { prompt } from 'inquirer';

interface Answers {
  networkKey: string;
}

async function run() {
  const answers = await prompt<Answers>([
    {
      name: 'networkKey',
      type: 'list',
      choices: ['testnet', 'mainnet', 'mocknet'],
      default: 'testnet',
    },
  ]);
  process.env.SUPPLIER_NETWORK = answers.networkKey;
  const stxKey = utils.randomPrivateKey();
  const stxNetwork = getStxNetworkVersion();

  const btcKey = utils.randomPrivateKey();
  const btcNetwork = getBtcNetwork();
  const btcSigner = ECPair.fromPrivateKey(Buffer.from(btcKey), { network: btcNetwork });
  const btcWIF = btcSigner.toWIF();

  const btcPayment = payments.p2pkh({ pubkey: btcSigner.publicKey, network: btcNetwork });

  console.log('Your addresses:');
  console.log('BTC Address:', btcPayment.address);
  console.log('STX Address:', makeStxAddress(bytesToHex(stxKey), stxNetwork));
  console.log('');

  console.log('Add to your .env file:');
  console.log(`SUPPLIER_NETWORK=${answers.networkKey}`);
  console.log(`SUPPLIER_STX_KEY=${bytesToHex(stxKey)}`);
  console.log(`SUPPLIER_BTC_KEY=${btcWIF}`);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
