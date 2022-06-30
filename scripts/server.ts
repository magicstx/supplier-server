import { api } from '../src';
import { logger } from '../src/logger';

async function run() {
  const server = await api();

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

  server.listen(port, '0.0.0.0', err => {
    if (err) console.error(err);
    logger.info({ topic: 'serverStart' }, `API listening on http://localhost:${port}`);
  });
}

run()
  .catch(console.error)
  .finally(() => {
    // process.exit();
  });
