import Fastify from 'fastify';
import { logConfig, validateConfig } from './config';
import { logger } from './logger';

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


  return server;
};
