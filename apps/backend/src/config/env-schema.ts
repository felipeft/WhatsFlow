import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        url.hostname.length > 0
      );
    }),
});

export function parseEnv(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Não incluir valores recebidos: podem conter credenciais.
    const keys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Variáveis de ambiente inválidas: ${keys.join(', ')}`);
  }
  return result.data;
}
