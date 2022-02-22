import { logConfig, validateConfig } from '../src/config';
import { withElectrumClient } from '../src/wallet';

async function run() {
  const config = validateConfig();
  logConfig(config);
  await withElectrumClient(async client => {
    const tx = await client.blockchain_transaction_get(
      '60479f4221a9869ff648687aa4e3497b71620e553fdb1f71c18bfaa8e2506456',
      true
    );
    console.log('tx', tx);
    console.log('Client works');
    return;
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
