import fetchMock from 'jest-fetch-mock';
import {
  eventCronQueue,
  eventQueue,
  finalizeInboundQueue,
  finalizeOutboundQueue,
  sendOutboundQueue,
  balancesQueue,
  FinalizeInboundJob,
  client,
} from '../src/worker/queues';
import {
  isFinalizeInboundEvent,
  isInitiateOutboundEvent,
  deserializeEvent,
  SerializedEvent,
  serializeEvent,
  Topics,
} from '../src/events';
import { eventJobHandler } from '../src/worker/jobs';
import { config } from 'dotenv';
config({ path: '.env.test' });

beforeEach(() => {
  fetchMock.enableMocks();
});
afterEach(() => {
  fetchMock.disableMocks();
  fetchMock.resetMocks();
});

//cleanup jobs
afterEach(async () => {
  await Promise.all([
    eventCronQueue.empty(),
    eventQueue.empty(),
    finalizeInboundQueue.empty(),
    finalizeOutboundQueue.empty(),
    sendOutboundQueue.empty(),
    balancesQueue.empty(),
  ]);
});

afterAll(() => {
  client?.disconnect();
});

function mockEvent<T = Event>(topic: Topics, print?: Record<string, any>) {
  return {
    txid: '',
    index: 0,
    print: {
      topic,
      ...print,
    },
  } as any as T;
}

describe('event queue', () => {
  test('finalize inbound events', async () => {
    const result = await eventJobHandler(mockEvent('finalize-inbound'));
    const jobs = await finalizeInboundQueue.getWaitingCount();
    expect(jobs).toEqual(1);
  });

  test('send outbound events', async () => {
    await eventJobHandler(mockEvent('initiate-outbound'));
    const jobs = await sendOutboundQueue.getWaitingCount();
    expect(jobs).toEqual(1);
  });

  test('unhandled topics', async () => {
    await eventJobHandler(mockEvent('escrow'));
    expect(await sendOutboundQueue.getWaitingCount()).toEqual(0);
    expect(await finalizeInboundQueue.getWaitingCount()).toEqual(0);
  });
});
