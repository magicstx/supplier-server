import { api } from '../src';
import { logger } from '../src/logger';

async function run() {
  const server = await api();

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

  await server.listen({
    port,
    host: '0.0.0.0',
  });
  logger.info({ topic: 'serverStart' }, `API listening on http://localhost:${port}`);
}

run()
  .catch(console.error)
  .finally(() => {
    // process.exit();
  });
