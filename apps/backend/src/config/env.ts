import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { parseEnv } from '@/config/env-schema.js';

export function loadEnv() {
  config({
    path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
    quiet: true,
  });
  return parseEnv(process.env);
}
