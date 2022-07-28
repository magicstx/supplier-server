import { Job } from 'bull';
import { EventJob } from './queues';
import {
  isFinalizeInboundEvent,
  isInitiateOutboundEvent,
  deserializeEvent,
  SerializedEvent,
  serializeEvent,
  Event,
} from '../events';
import {
  eventCronQueue,
  eventQueue,
  finalizeInboundQueue,
  finalizeOutboundQueue,
  sendOutboundQueue,
  balancesQueue,
} from './queues';
import { getLastSeenTxid, RedisClient, setLastSeenTxid } from '../store';
import { fetchCoreInfo, getContractEventsUntil } from '../stacks-api';
import { logger } from '../logger';

export function deserializeJob<T>(job: { data: { event: SerializedEvent<T> } }) {
  return deserializeEvent(job.data.event);
}

export async function eventJobHandler(event: Event) {
  if (isFinalizeInboundEvent(event)) {
    await finalizeInboundQueue.add({ event: serializeEvent(event) });
  } else if (isInitiateOutboundEvent(event)) {
    await sendOutboundQueue.add({ event: serializeEvent(event) });
  }
  return {
    topic: event.print.topic,
  };
}

export async function eventCronJob(client: RedisClient) {
  const [lastSeenTxid, { stacks_tip: startTip }] = await Promise.all([
    getLastSeenTxid(client),
    fetchCoreInfo(),
  ]);

  const newEvents = await getContractEventsUntil(lastSeenTxid);

  const { stacks_tip: endTip } = await fetchCoreInfo();
  if (endTip !== startTip) {
    // possible race condition. exit and retry at next repeat
    return {
      newEvents: [],
      lastSeenTxid,
    };
  }

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
}
