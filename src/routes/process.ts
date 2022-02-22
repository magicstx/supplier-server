import { FastifyPluginCallback } from 'fastify';
import { processPendingOutbounds } from '../processors/finalize-outbound';
import { processAll, processTx } from '../processors';
import { fetchTransaction } from 'micro-stacks/api';
import { getStxNetwork } from '../config';
import { Transaction } from '@stacks/stacks-blockchain-api-types';

export const processRoute: FastifyPluginCallback = (server, opts, done) => {
  server.get('/process', async (req, res) => {
    await processAll(server.redis);
    return res.send({ success: true });
  });

  server.get('/process/pending-outbound', async (req, res) => {
    await processPendingOutbounds(server.redis);
    return res.send({ success: true });
  });

  server.get<{ Querystring: { txid: string } }>('/process-tx', async (req, res) => {
    const network = getStxNetwork();
    const { txid } = req.query;

    const tx = (await fetchTransaction({ txid, url: network.getCoreApiUrl() })) as Transaction;
    await processTx(tx, server.redis);

    return res.send({ success: true });
  });
  done();
};
