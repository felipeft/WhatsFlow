import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client.js';

export function createDatabase(connectionString: string) {
  const schema =
    new URL(connectionString).searchParams.get('schema') ?? 'public';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error('INVALID_DATABASE_SCHEMA');
  const adapter = new PrismaPg(
    {
      connectionString,
      options: `-c search_path=${schema}`,
      max: 5,
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
      statement_timeout: 2500,
    },
    { schema },
  );
  const client = new PrismaClient({ adapter, log: [] });
  return {
    client,
    connect: () => client.$connect(),
    disconnect: () => client.$disconnect(),
    check: async () => {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
