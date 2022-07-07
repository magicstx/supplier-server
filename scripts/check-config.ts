import 'cross-fetch/polyfill';
import { logConfig, validateConfig, validateKeys, validateKeysMatch } from '../src/config';
import { logger } from '../src/logger';
import { getBalances } from '../src/wallet';

async function run() {
  try {
    const config = validateConfig();
    logConfig(config);
    await validateKeysMatch();
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
