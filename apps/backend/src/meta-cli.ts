import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadEnv } from '@/config/env.js';
import { createDatabase } from '@/infrastructure/database.js';
import { createLogger } from '@/infrastructure/logger.js';
import { getMetaConfig } from '@/integrations/meta/config.js';
import { createMetaStore } from '@/integrations/meta/store.js';
import { enqueueSchema } from '@/integrations/meta/dto.js';

async function run() {
  const env = loadEnv();
  const config = getMetaConfig(env);
  if (!config) throw new Error('META_DISABLED');
  const [command, argument] = process.argv.slice(2);
  if (!argument || !['enqueue', 'status'].includes(command ?? ''))
    throw new Error('INVALID_COMMAND');
  const database = createDatabase(env.DATABASE_URL);
  try {
    const store = createMetaStore(database.client, createLogger(env.LOG_LEVEL));
    if (command === 'enqueue') {
      // Arquivo local evita conteúdo pessoal no histórico do shell. Não envia imediatamente.
      const input = enqueueSchema.parse(
        JSON.parse(await readFile(argument, 'utf8')) as unknown,
      );
      const id = await store.enqueue(config.phoneNumberId, input);
      process.stdout.write(
        `${JSON.stringify({ messageId: id, queued: true })}\n`,
      );
    } else {
      const message = await store.inspect(z.uuid().parse(argument));
      if (!message) throw new Error('MESSAGE_NOT_FOUND');
      process.stdout.write(`${JSON.stringify(message, null, 2)}\n`);
    }
  } finally {
    await database.disconnect();
  }
}

run().catch(() => {
  // Não serializar erros Zod/Prisma, arquivo, destino ou conteúdo.
  process.stderr.write(
    'Falha: confira configuração, banco, comando e arquivo. Uso: meta enqueue ARQUIVO.json | meta status UUID\n',
  );
  process.exitCode = 1;
});
