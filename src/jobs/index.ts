import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import { logger } from '../logger';
import { processAll } from '../processors';
import { RedisClient } from '../store';
import { getBalances, getBtcBalance } from '../wallet';

export const processJob = (client: RedisClient) => {
  const task = new AsyncTask('process', async () => {
    await processAll(client);
  });
  return new SimpleIntervalJob({ seconds: 30, runImmediately: true }, task);
};

export const balancesJob = () => {
  const task = new AsyncTask('balances', async () => {
    const { stx, btc, xbtc } = await getBalances();
    const message = `Balances: ${stx.stx} STX; ${btc.btc} BTC; ${xbtc.xbtc} xBTC`;
    logger.info(
      {
        topic: 'balances',
        stx,
        btc,
        bridge: xbtc.xbtc,
      },
      message
    );
  });
  return new SimpleIntervalJob({ minutes: 5, runImmediately: true }, task);
};
