import 'cross-fetch/polyfill';
import {
  getNetworkKey,
  hasSupplierId,
  logConfig,
  validateConfig,
  validateKeys,
  validateKeysMatch,
} from '../src/config';
import { getContracts } from '../src/stacks';
import { logger } from '../src/logger';
import { getBalances } from '../src/wallet';

async function run() {
  try {
    if (hasSupplierId()) {
      const config = validateConfig();
      logConfig(config);
      await validateKeysMatch();
    } else {
      const config = validateKeys();
      logConfig(config);
      logger.debug('No SUPPLIER_ID - skipping supplier registration check.');
    }
    const contracts = getContracts();
    logger.debug(
      {
        bridge: contracts.bridge.identifier,
        xbtc: contracts.wrappedBitcoin.identifier,
        network: getNetworkKey(),
      },
      'Configured contracts:'
    );
    const balances = await getBalances();
    logger.debug({
      btc: balances.btc.btc,
      stx: balances.stx.stx,
      xbtcFunds: balances.xbtc.xbtc,
      xbtcExternal: balances.stx.xbtc,
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
