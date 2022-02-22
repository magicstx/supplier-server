import { FastifyPluginCallback } from 'fastify';
import { ApiKeyQuery } from '.';
import { removeAll } from '../store';

export const flushRoute: FastifyPluginCallback = (server, opts, done) => {
  server.get<{ Querystring: ApiKeyQuery }>('/flush', async (req, res) => {
    if (process.env.API_KEY) {
      if (req.query.key !== process.env.API_KEY) {
        return res.status(409).send({ error: 'unauthorized' });
      }
    }
    const client = server.redis;
    await removeAll(client);
    return res.status(200).send({ ok: true });
  });
  done();
};
