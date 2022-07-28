import Fastify from 'fastify';
import BasicAuth, { FastifyBasicAuthOptions } from '@fastify/basic-auth';
import { logger } from './logger';
import { bullRoute } from './routes/bull-adapter';

export const validate: FastifyBasicAuthOptions['validate'] = async (username, password) => {
  const key = process.env.WEB_UI_PASSWORD;
  if (!key) return Promise.resolve();
  if (password !== key) {
    throw new Error('Invalid password.');
  }
  return Promise.resolve();
};

export const api = async () => {
  const server = Fastify({ logger });
  await server.register(BasicAuth, { validate });
  server.setErrorHandler((err, req, reply) => {
    logger.error(err);
    if (err instanceof Error) {
      logger.error(err.stack);
      void reply.status(500).send({ status: 'error' });
      return;
    }
    void reply.status(500).send({ status: 'error' });
    return;
  });

  await server.register(bullRoute().registerPlugin());

  return server;
};
