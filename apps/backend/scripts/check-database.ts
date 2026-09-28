import { loadEnv } from '@/config/env.js';
import { createDatabase } from '@/infrastructure/database.js';

const database = createDatabase(loadEnv().DATABASE_URL);
try {
  await database.check();
  console.log('Prisma: SELECT 1 executado com sucesso.');
} catch {
  console.error(
    'Falha na conexão Prisma. Verifique DATABASE_URL e PostgreSQL.',
  );
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
