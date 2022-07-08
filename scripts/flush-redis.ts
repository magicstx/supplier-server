import { createRedisClient, removeAll } from '../src/store';
import { prompt } from 'inquirer';

async function run() {
  const client = createRedisClient();
  const { ok } = await prompt<{ ok: boolean }>([
    {
      name: 'ok',
      type: 'confirm',
      message: 'WARNING: you are about to erase the Redis database. Continue?',
    },
  ]);
  if (ok) {
    await removeAll(client);
    console.log('Redis flushed.');
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
