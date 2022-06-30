import { FastifyPluginCallback } from 'fastify';
import { processPendingOutbounds } from '../processors/finalize-outbound';
import { processAll } from '../processors';

export const processRoute: FastifyPluginCallback = (server, opts, done) => {
  server.get('/process', async (req, res) => {
    await processAll(server.redis);
    return res.send({ success: true });
  });

  server.get('/process/pending-outbound', async (req, res) => {
    await processPendingOutbounds(server.redis);
    return res.send({ success: true });
  });

  done();
};
