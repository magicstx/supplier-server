import { logConfig, validateConfig, validateKeys } from '../src/config';
import { logger } from '../src/logger';
import { getBalances } from '../src/wallet';

async function run() {
  try {
    const config = validateConfig();
    logConfig(config);
    const balances = await getBalances();
    logger.debug({
      btc: balances.btc.btc,
      stx: balances.stx.stx,
    });
  } catch (error) {
    logger.error(error);
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
