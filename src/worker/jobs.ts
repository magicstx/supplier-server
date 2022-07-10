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
