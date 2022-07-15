import pino, { TransportTargetOptions } from 'pino';
import type PinoLoki from 'pino-loki';

type LokiOptions = Parameters<typeof PinoLoki>[0];

function getLokiTransport(): TransportTargetOptions | null {
  if (process.env.SUPPLIER_LOKI_HOST) {
    const options: LokiOptions = {
      host: process.env.SUPPLIER_LOKI_HOST,
      batching: true,
      interval: 5,
      basicAuth: {
        username: process.env.SUPPLIER_LOKI_USERNAME!,
        password: process.env.SUPPLIER_LOKI_PASSWORD!,
      },
    };
    return {
      target: 'pino-loki',
      options,
      level: 'trace',
    };
  }
  return null;
}
interface Transport<T extends Record<string, unknown>> {
  target: string;
  options?: T;
  level?: string;
}

export let logger: pino.Logger;
if (process.env.NODE_ENV === 'development') {
  logger = pino({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
    level: 'debug',
  });
} else if (process.env.NODE_ENV === 'test') {
  logger = pino({
    level: 'silent',
  });
} else {
  const transports: TransportTargetOptions[] = [
    { target: 'pino/file', options: {}, level: 'trace' },
  ];
  const loki = getLokiTransport();
  if (loki) transports.push(loki);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const transport = pino.transport({
    targets: transports,
  });
  logger = pino(transport);
  // logger = pino({
  //   level: 'trace',
  // });
}
