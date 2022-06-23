import { createRedisClient, removeAll } from '../src/store';

async function run() {
  const client = createRedisClient();
  await removeAll(client);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
