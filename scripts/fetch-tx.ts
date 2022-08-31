import 'cross-fetch/polyfill';
import { withElectrumClient } from '../src/wallet';

const [txid] = process.argv.slice(2);

async function run() {
  await withElectrumClient(async client => {
    const tx = await client.blockchain_transaction_get(txid, true);
    console.log(tx);
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
