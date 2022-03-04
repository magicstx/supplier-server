import { logConfig, validateConfig, validateKeys } from '../src/config';

let config: Record<string, string | number> = validateKeys();
try {
  config = validateConfig();
} catch (error) {}

logConfig(config);
