import { createApp } from '@/app.js';
import { loadEnv } from '@/config/env.js';
import { createDatabase } from '@/infrastructure/database.js';
import { createLogger } from '@/infrastructure/logger.js';
import { getMetaConfig } from '@/integrations/meta/config.js';
import { createMetaStore } from '@/integrations/meta/store.js';
import { createWebhookService } from '@/integrations/meta/webhook.service.js';
import { createConversationService } from '@/modules/conversations/conversation.service.js';

async function start() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const database = createDatabase(env.DATABASE_URL);
  await database.connect();
  await database.check();

  const meta = getMetaConfig(env);
  const server = createApp({
    logger,
    checkDatabase: database.check,
    conversations: createConversationService(database.client),
    ...(meta
      ? {
          metaWebhook: createWebhookService(
            meta,
            createMetaStore(database.client, logger),
          ),
        }
      : {}),
  }).listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT }, 'Servidor iniciado');
  });
  server.on('error', () => {
    logger.fatal(
      { event: 'server_start_failed' },
      'Não foi possível iniciar o servidor',
    );
    void database.disconnect().finally(() => process.exit(1));
  });

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    logger.info('Encerrando servidor');
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      void database
        .disconnect()
        .then(() => {
          clearTimeout(deadline);
          process.exit(0);
        })
        .catch(() => process.exit(1));
    });
    server.closeIdleConnections();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

start().catch((error: unknown) => {
  const logger = createLogger();
  // Detalhes de conexão nunca são serializados. Env expõe apenas nomes das chaves.
  const message =
    error instanceof Error &&
    (error.message.startsWith('Variáveis de ambiente inválidas:') ||
      error.message.startsWith('Configuração Meta inválida:'))
      ? error.message
      : 'Falha no bootstrap; verifique configuração e disponibilidade do banco';
  logger.fatal({ event: 'bootstrap_failed' }, message);
  process.exit(1);
});
