import { getContractEventsUntil, getContractTxUntil } from '../stacks-api';
import { getLastSeenTxid, RedisClient, setLastSeenTxid } from '../store';
import { processOutboundSwap } from './outbound';
import { processFinalizedInbound } from './redeem-htlc';
import { logger } from '../logger';
import { processPendingOutbounds } from './finalize-outbound';
import { Event } from '../events';

export async function processEvent(event: Event, client: RedisClient) {
  await Promise.all([processFinalizedInbound(event, client), processOutboundSwap(event, client)]);
  return Promise.resolve(event);
}

export async function processAll(client: RedisClient) {
  const lastSeenTxid = await getLastSeenTxid(client);
  const newEvents = await getContractEventsUntil(lastSeenTxid);
  if (newEvents.length > 0) {
    const topics = newEvents.map(e => e.print.topic);
    logger.debug({ topic: 'processEvents', topics }, `Processing ${newEvents.length} new events`);
  }
  const jobs: Promise<any>[] = newEvents.map(tx => processEvent(tx, client));
  jobs.concat(processPendingOutbounds(client));
  await Promise.all(jobs);
  const [firstEvent] = newEvents;
  if (firstEvent !== undefined) {
    await setLastSeenTxid(client, firstEvent.txid);
  }
  return true;
}
