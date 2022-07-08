import { getBridgeEvents, getTransactionEvent } from '../src/stacks-api';

async function run() {
  const events = await getBridgeEvents();

  await Promise.all(
    events.map(async e => {
      const f = await getTransactionEvent(e.tx_id, e.event_index);
      if (e.tx_id !== f.tx_id || e.event_index !== f.event_index) {
        throw new Error('Mismatch');
      }
    })
  );
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });