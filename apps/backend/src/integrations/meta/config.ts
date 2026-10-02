import { z } from 'zod';

const optionalSecret = z.string().trim().default('');

export const metaEnvironment = {
  META_ENABLED: z.enum(['true', 'false']).default('false'),
  META_APP_SECRET: optionalSecret,
  META_VERIFY_TOKEN: optionalSecret,
  META_ACCESS_TOKEN: optionalSecret,
  META_PHONE_NUMBER_ID: optionalSecret,
  META_WABA_ID: optionalSecret,
  META_API_BASE_URL: optionalSecret,
  META_API_VERSION: optionalSecret,
  META_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(10000),
  META_WORKER_POLL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(1000),
};

export const metaConfigSchema = z.object({
  appSecret: z.string().min(16),
  verifyToken: z.string().min(32),
  accessToken: z.string().min(1),
  phoneNumberId: z.string().regex(/^\d+$/),
  wabaId: z.string().regex(/^\d+$/),
  apiBaseUrl: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname === 'graph.facebook.com' &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.pathname === '/' || url.pathname === '')
      );
    }),
  apiVersion: z.string().regex(/^v\d+\.0$/),
  requestTimeoutMs: z.number(),
  pollMs: z.number(),
});

export type MetaConfig = z.infer<typeof metaConfigSchema>;

export function getMetaConfig(
  env: z.infer<z.ZodObject<typeof metaEnvironment>>,
): MetaConfig | undefined {
  if (env.META_ENABLED === 'false') return undefined;
  const result = metaConfigSchema.safeParse({
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_VERIFY_TOKEN,
    accessToken: env.META_ACCESS_TOKEN,
    phoneNumberId: env.META_PHONE_NUMBER_ID,
    wabaId: env.META_WABA_ID,
    apiBaseUrl: env.META_API_BASE_URL,
    apiVersion: env.META_API_VERSION,
    requestTimeoutMs: env.META_REQUEST_TIMEOUT_MS,
    pollMs: env.META_WORKER_POLL_MS,
  });
  if (!result.success) {
    throw new Error(
      `Configuração Meta inválida: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}
