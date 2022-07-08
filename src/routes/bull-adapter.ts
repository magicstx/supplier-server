import { createBullBoard } from '@bull-board/api';
import { FastifyAdapter } from '@bull-board/fastify';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { allQueues } from '../worker/queues';

export function bullRoute() {
  const serverAdapter = new FastifyAdapter();
  const queues = allQueues.map(q => new BullAdapter(q));

  createBullBoard({
    queues,
    serverAdapter,
  });

  return serverAdapter;
}
