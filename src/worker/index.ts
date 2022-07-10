import {
  isFinalizeInboundEvent,
  isInitiateOutboundEvent,
  deserializeEvent,
  SerializedEvent,
  serializeEvent,
} from '../events';
import { logger } from '../logger';
import { getContractEventsUntil } from '../stacks-api';
import { createRedisClient, getLastSeenTxid, getRedisUrl, setLastSeenTxid } from '../store';
import { processPendingOutbounds } from '../processors/finalize-outbound';
import { processFinalizedInbound } from '../processors/redeem-htlc';
import { processOutboundSwap } from '../processors/outbound';
import {
  eventCronQueue,
  eventQueue,
  finalizeInboundQueue,
  finalizeOutboundQueue,
  sendOutboundQueue,
  balancesQueue,
} from './queues';
import { getBalances } from '../wallet';
import { EventEmitter } from 'events';
import { eventJobHandler } from './jobs';

export function deserializeJob<T>(job: { data: { event: SerializedEvent<T> } }) {
  return deserializeEvent(job.data.event);
}

export function initWorkerThread() {
  EventEmitter.defaultMaxListeners = 30;
  const client = createRedisClient();

  void finalizeInboundQueue.process(1, async job => {
    const event = await deserializeJob(job);
    return processFinalizedInbound(event, client);
  });

  void sendOutboundQueue.process(1, async job => {
    const event = await deserializeJob(job);
    return processOutboundSwap(event, client);
  });

  void eventQueue.process(async job => {
    const event = await deserializeJob(job);
    return await eventJobHandler(event);
  });

  void eventCronQueue.process(1, async () => {
    const lastSeenTxid = await getLastSeenTxid(client);
    const newEvents = await getContractEventsUntil(lastSeenTxid);
    if (newEvents.length > 0) {
      const topics = newEvents.map(e => e.print.topic);
      logger.debug({ topic: 'processEvents', topics }, `Processing ${newEvents.length} new events`);
    }
    const [firstEvent] = newEvents;
    if (firstEvent !== undefined) {
      await setLastSeenTxid(client, firstEvent.txid);
    }
    const eventJobs = newEvents.map(event => ({ data: { event: serializeEvent(event) } }));
    await eventQueue.addBulk(eventJobs);
    return {
      newEvents: newEvents.length,
      lastSeenTxid,
    };
  });

  void finalizeOutboundQueue.process(1, async () => {
    return processPendingOutbounds(client);
  });

  void balancesQueue.process(1, async () => {
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
    return {
      message,
      stx,
      btc,
      bridge: xbtc.xbtc,
    };
  });

  void finalizeOutboundQueue.add({}, { repeat: { every: 120_000 } });
  void eventCronQueue.add({}, { repeat: { every: 120_000 } });
  void balancesQueue.add({}, { repeat: { every: 60_000 } });
}
