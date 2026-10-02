import { z } from 'zod';
import type { Logger } from 'pino';
import type { MetaConfig } from './config.js';
import type { OutboundContent } from './dto.js';

export class MetaApiError extends Error {
  constructor(
    public readonly kind: 'rejected' | 'rate_limit' | 'uncertain',
    public readonly httpStatus?: number,
    public readonly providerCode?: number,
    public readonly retryAfterMs = 1000,
  ) {
    super(`META_${kind.toUpperCase()}`);
  }
}

export interface MetaSender {
  send(input: {
    id: string;
    phoneNumberId: string;
    to: string;
    content: OutboundContent;
  }): Promise<string>;
}

const acceptedSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1).max(256) })).min(1),
});
const errorSchema = z.object({ error: z.object({ code: z.number().int() }) });

export function createMetaClient(
  config: MetaConfig,
  logger: Logger,
  transport: typeof fetch = fetch,
): MetaSender {
  return {
    async send(input) {
      if (input.phoneNumberId !== config.phoneNumberId)
        throw new MetaApiError('rejected');
      const started = performance.now();
      let status: number | undefined;
      try {
        const response = await transport(
          `${config.apiBaseUrl.replace(/\/$/, '')}/${config.apiVersion}/${config.phoneNumberId}/messages`,
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(config.requestTimeoutMs),
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: input.to,
              biz_opaque_callback_data: input.id,
              ...input.content,
            }),
          },
        );
        status = response.status;
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const parsed = errorSchema.safeParse(payload);
          const code = parsed.success ? parsed.data.error.code : undefined;
          // Repetir apenas rejeições explícitas por rate limit. 5xx pode ser ambíguo.
          const rateLimit =
            status === 429 ||
            (status === 400 &&
              code !== undefined &&
              [4, 80007, 130429, 131056].includes(code));
          const retryHeader = response.headers.get('retry-after');
          const retryValue =
            retryHeader === null
              ? 1000
              : /^\d+$/.test(retryHeader)
                ? Number(retryHeader) * 1000
                : Date.parse(retryHeader) - Date.now();
          throw new MetaApiError(
            rateLimit ? 'rate_limit' : status >= 500 ? 'uncertain' : 'rejected',
            status,
            code,
            Number.isFinite(retryValue)
              ? Math.max(1000, Math.min(retryValue, 86400000))
              : 1000,
          );
        }
        const accepted = acceptedSchema.safeParse(payload);
        const id = accepted.success ? accepted.data.messages[0]?.id : undefined;
        if (!id) throw new MetaApiError('uncertain', status);
        logger.info(
          { event: 'meta_message_accepted', messageId: input.id },
          'Mensagem aceita pela Meta; entrega pendente',
        );
        return id;
      } catch (error) {
        const failure =
          error instanceof MetaApiError
            ? error
            : new MetaApiError('uncertain', status);
        logger.warn(
          {
            event:
              failure.providerCode === 190 || status === 401 || status === 403
                ? 'meta_auth_failed'
                : 'meta_request_failed',
            messageId: input.id,
            kind: failure.kind,
            httpStatus: failure.httpStatus,
            providerCode: failure.providerCode,
          },
          'Falha na Meta',
        );
        throw failure;
      } finally {
        logger.info(
          {
            event: 'meta_request_completed',
            messageId: input.id,
            httpStatus: status,
            durationMs: Math.round(performance.now() - started),
          },
          'Requisição Meta finalizada',
        );
      }
    },
  };
}
