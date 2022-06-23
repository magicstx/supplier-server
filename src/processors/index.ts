import { getContractTxUntil } from '../stacks-api';
import { getLastSeenTxid, RedisClient, setLastSeenTxid } from '../store';
import { processOutboundSwap } from './outbound';
import { processFinalizedInbound } from './redeem-htlc';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import { logger } from '../logger';
import { processPendingOutbounds } from './finalize-outbound';

export async function processTx(tx: Transaction, client: RedisClient) {
  await Promise.all([processFinalizedInbound(tx, client), processOutboundSwap(tx, client)]);
  return Promise.resolve(tx);
}

export async function processAll(client: RedisClient) {
  const lastSeenTxid = await getLastSeenTxid(client);
  const newTxs = await getContractTxUntil(lastSeenTxid);
  if (newTxs.length > 0) {
    const txids = newTxs.map(t => t.tx_id);
    logger.debug({ txids }, `Processing ${newTxs.length} new transactions`);
  }
  const jobs: Promise<any>[] = newTxs.map(tx => processTx(tx, client));
  jobs.concat(processPendingOutbounds(client));
  await Promise.all(jobs);
  const [firstTx] = newTxs;
  if (firstTx !== undefined) {
    await setLastSeenTxid(client, firstTx.tx_id);
  }
  return true;
}
