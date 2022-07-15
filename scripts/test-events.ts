import { getPrintFromRawEvent } from '../src/events';
import { getBridgeEvents, getTransactionEvent } from '../src/stacks-api';

async function run() {
  const events = await getBridgeEvents();
  console.log('events.length', events.length);

  await Promise.all(
    events.map(async e => {
      const f = await getTransactionEvent(e.tx_id, e.event_index);
      if (e.tx_id !== f.tx_id || e.event_index !== f.event_index) {
        throw new Error('Mismatch');
      }
      const event = getPrintFromRawEvent(f);
      console.log(event);
    })
  );
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
