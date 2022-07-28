import Queue, { Queue as QueueType, QueueOptions } from 'bull';
import { Event, FinalizeInboundPrint, InitiateOutboundPrint, SerializedEvent } from '../events';
import { createWorkerRedisClient } from '../store';
import Redis from 'ioredis';

export interface EventJob {
  event: SerializedEvent;
}

export interface FinalizeInboundJob {
  event: SerializedEvent<FinalizeInboundPrint>;
}

export interface SendOutboundJob {
  event: SerializedEvent<InitiateOutboundPrint>;
}

export let client: Redis | undefined;
export let subscriber: Redis | undefined;

const opts: QueueOptions = {
  createClient: function (type) {
    switch (type) {
      case 'client':
        if (!client) {
          client = createWorkerRedisClient();
        }
        return client;
      case 'subscriber':
        if (!subscriber) {
          subscriber = createWorkerRedisClient();
        }
        return subscriber;
      case 'bclient':
        return createWorkerRedisClient();
      default:
        throw new Error(`Unexpected connection type: ${String(type)}`);
    }
  },
};

export const eventQueue = new Queue<EventJob>('events', opts);

export const finalizeInboundQueue = new Queue<FinalizeInboundJob>('finalize-inbound', {
  ...opts,
  defaultJobOptions: {
    attempts: 12,
    backoff: {
      type: 'fixed',
      delay: 10 * 60 * 1000, // attempt every 10 minutes
    },
  },
});

export const sendOutboundQueue = new Queue<SendOutboundJob>('send-outbound', opts);

export const finalizeOutboundQueue = new Queue('finalize-outbound', {
  ...opts,
  defaultJobOptions: {
    attempts: 24,
    backoff: {
      type: 'fixed',
      delay: 10 * 60 * 1000, // attempt every 10 minutes
    },
  },
});

export const eventCronQueue = new Queue('events-cron', opts);

export const balancesQueue = new Queue('balance-check', opts);

export const allQueues = [
  eventQueue,
  finalizeInboundQueue,
  sendOutboundQueue,
  finalizeOutboundQueue,
  eventCronQueue,
  balancesQueue,
];
