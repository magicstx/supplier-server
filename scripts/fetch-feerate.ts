import 'cross-fetch/polyfill';
import { getElectrumConfig } from '../src/config';
import { getFeeRate, withElectrumClient } from '../src/wallet';

async function run() {
  console.log(getElectrumConfig());
  await withElectrumClient(async client => {
    const feeRate = await getFeeRate(client);
    console.log('feeRate', feeRate);
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
