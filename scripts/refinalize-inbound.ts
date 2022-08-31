import 'cross-fetch/polyfill';
import { FinalizeInboundPrint } from '../src/events';
import { processFinalizedInbound } from '../src/processors/redeem-htlc';
import { createRedisClient } from '../src/store';
import { deserializeJob } from '../src/worker/jobs';
import { finalizeInboundQueue } from '../src/worker/queues';

const [txid, index] = process.argv.slice(2);

async function run() {
  const job = {
    data: {
      event: {
        txid,
        index: parseInt(index, 10),
      },
    },
  };
  const event = await deserializeJob<FinalizeInboundPrint>(job);
  // console.log(event);
  const client = createRedisClient();
  const result = await processFinalizedInbound(event, client);
  console.log(result);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
