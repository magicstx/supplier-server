import { logConfig, validateConfig } from '../src/config';
import { withElectrumClient } from '../src/wallet';

async function run() {
  const config = validateConfig();
  logConfig(config);
  await withElectrumClient(async client => {
    const feeRate = await client.blockchainEstimatefee(1);
    console.log('feeRatePerKb', feeRate);
    console.log('sats/vB', feeRate * 1024);
    // const tx = await client.blockchain_transaction_get(
    //   '7bd503fde9684573bc276613b0a1176eea1116f95c5b0e30b41649add7ac770b',
    //   true
    // );
    // if (typeof tx === 'undefined') {
    //   throw new Error('Invalid config.');
    // } else {
    //   console.log('tx', tx);
    //   console.log('Client works');
    // }
    return;
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
