import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client.js';

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    statement_timeout: 2500,
  });
  const client = new PrismaClient({ adapter, log: [] });
  return {
    connect: () => client.$connect(),
    disconnect: () => client.$disconnect(),
    check: async () => {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
