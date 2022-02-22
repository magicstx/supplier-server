import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import { processAll } from './processors';
import { RedisClient } from './store';

export const processJob = (client: RedisClient) => {
  const task = new AsyncTask('process', async () => {
    await processAll(client);
  });
  return new SimpleIntervalJob({ seconds: 300 }, task);
};
