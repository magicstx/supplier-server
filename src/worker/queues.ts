import Queue, { QueueOptions } from 'bull';
import { FinalizeInboundPrint, InitiateOutboundPrint, SerializedEvent } from '../events';
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

function fixedBackoff(attempts: number, delay: number) {
  return {
    ...opts,
    defaultJobOptions: {
      attempts: attempts,
      backoff: {
        type: 'fixed',
        delay: delay,
      },
    },
  };
}

function fixedBackoffMins(attempts: number, delayMinutes: number) {
  return fixedBackoff(attempts, delayMinutes * 60 * 1000);
}

export const eventQueue = new Queue<EventJob>('events', opts);

export const finalizeInboundQueue = new Queue<FinalizeInboundJob>(
  'finalize-inbound',
  fixedBackoffMins(12, 10)
);

export const sendOutboundQueue = new Queue<SendOutboundJob>('send-outbound', opts);

export const finalizeOutboundQueue = new Queue('finalize-outbound', fixedBackoffMins(24, 10));

export const eventCronQueue = new Queue('events-cron', opts);

export const balancesQueue = new Queue('balance-check', fixedBackoffMins(12, 5));

export const allQueues = [
  eventQueue,
  finalizeInboundQueue,
  sendOutboundQueue,
  finalizeOutboundQueue,
  eventCronQueue,
  balancesQueue,
];
