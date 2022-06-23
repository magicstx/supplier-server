import Fastify from 'fastify';
import FastifyRedis from 'fastify-redis';
import fastifySchedulePlugin from 'fastify-schedule';
import { createRedisClient } from './store';
import { processRoute } from './routes/process';

import { logConfig, validateConfig } from './config';
import { logger } from './logger';
import { flushRoute } from './routes/flush';
import { balancesJob, processJob } from './jobs';
import { infoRoute } from './routes/info';

export const api = async () => {
  const config = validateConfig();
  logConfig(config);

  const server = Fastify({ logger });
  server.setErrorHandler((err, req, reply) => {
    logger.error(err);
    if (err instanceof Error) {
      console.error(err.stack);
      void reply.status(500).send({ error: err.message });
      return;
    }
    void reply.status(500).send({ status: 'error' });
    return;
  });
  const redis = createRedisClient();
  server.decorate('redis', redis);
  await server.register(fastifySchedulePlugin);
  const job = processJob(redis);
  server.scheduler.addSimpleIntervalJob(job);
  server.scheduler.addSimpleIntervalJob(balancesJob());
  // server.addHook('onClose', async (fastify, done) => {
  //   await redis.disconnect();
  //   done();
  // });

  await server.register(processRoute);
  await server.register(flushRoute);
  await server.register(infoRoute);

  return server;
};
