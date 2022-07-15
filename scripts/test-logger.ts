import { logger } from '../src/logger';

logger.info(process.env.SUPPLIER_LOKI_HOST);
logger.info('Testing logger.');

let ping = 0;

setInterval(() => {
  ping += 1;
  logger.info({ ping }, 'logger test');
}, 1000);
