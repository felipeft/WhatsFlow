import { setTimeout as delay } from 'node:timers/promises';
import { loadEnv } from '@/config/env.js';
import { createDatabase } from '@/infrastructure/database.js';
import { createLogger } from '@/infrastructure/logger.js';
import { getMetaConfig } from '@/integrations/meta/config.js';
import { createMetaClient } from '@/integrations/meta/client.js';
import { createMetaStore } from '@/integrations/meta/store.js';
import { createMetaWorker } from '@/integrations/meta/worker.service.js';

async function start() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const config = getMetaConfig(env);
  if (!config) throw new Error('META_DISABLED');
  const database = createDatabase(env.DATABASE_URL);
  let stopping = false;
  const controller = new AbortController();
  const stop = () => {
    stopping = true;
    controller.abort();
    setTimeout(() => process.exit(1), 40000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await database.connect();
    await database.check();
    const worker = createMetaWorker(
      createMetaStore(database.client, logger),
      createMetaClient(config, logger),
      config.phoneNumberId,
      logger,
    );
    logger.info({ event: 'meta_worker_started' }, 'Worker iniciado');
    while (!stopping) {
      let busy = false;
      try {
        busy = await worker.tick();
      } catch {
        logger.error(
          { event: 'meta_worker_failed' },
          'Falha no ciclo do worker',
        );
      }
      if (!busy && !stopping)
        await delay(config.pollMs, undefined, {
          signal: controller.signal,
        }).catch(() => undefined);
    }
  } finally {
    await database.disconnect();
  }
}

start().catch(() => {
  createLogger().fatal(
    { event: 'meta_worker_bootstrap_failed' },
    'Verifique configuração Meta e banco',
  );
  process.exitCode = 1;
});
