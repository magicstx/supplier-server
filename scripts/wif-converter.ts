import { ECPair } from 'bitcoinjs-lib';
import { getBtcNetwork } from '../src/config';

function run() {
  const [pk] = process.argv.slice(2);
  console.log(`Private key: ${pk}`);
  const pkHex = Buffer.from(pk, 'hex').slice(0, 32);
  const ec = ECPair.fromPrivateKey(pkHex, { network: getBtcNetwork() });
  const wif = ec.toWIF();
  console.log(`WIF: ${wif}`);
  return Promise.resolve(true);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
