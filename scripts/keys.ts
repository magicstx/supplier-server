import { createRedisClient, RedisClient, RedisKeys } from '../src/store';

async function getAll(client: RedisClient): Promise<string[]> {
  return new Promise(resolve => {
    const keys = [];
    const stream = client.scanStream({
      count: 100,
    });
    stream.on('data', (res: string[]) => {
      keys.push(...res);
    });
    stream.on('end', () => {
      resolve(keys);
    });
  });
}

async function run() {
  const client = createRedisClient();
  const keys = await getAll(client);
  const values = await client.mget(keys);
  console.log('values', values);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = values[i];
    console.log(key, value);
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
