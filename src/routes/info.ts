import { FastifyPluginCallback } from 'fastify';
import { ApiKeyQuery } from '.';
import { getAllPendingFinalizedOutbound, getLastSeenTxid } from '../store';

export const infoRoute: FastifyPluginCallback = (server, opts, done) => {
  server.get<{ Querystring: ApiKeyQuery }>('/info', async (req, res) => {
    if (process.env.API_KEY) {
      if (req.query.key !== process.env.API_KEY) {
        return res.status(409).send({ error: 'unauthorized' });
      }
    }

    const lastTxid = await getLastSeenTxid(server.redis);
    const pendingOutbounds = await getAllPendingFinalizedOutbound(server.redis);

    return res.status(200).send({
      lastTxid,
      pendingOutbounds,
    });
  });
  done();
};
