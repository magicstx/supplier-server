import { createRedisClient, getAllKeysAndValues } from '../src/store';

async function run() {
  const client = createRedisClient();
  const all = await getAllKeysAndValues(client);
  for (const [key, value] of all) {
    console.log(key, value);
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
