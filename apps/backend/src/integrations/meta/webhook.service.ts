import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseWebhook, webhookSchema } from './dto.js';
import type { MetaConfig } from './config.js';

export class WebhookError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export interface InboxWriter {
  accept(digest: string, payload: unknown): Promise<boolean>;
}

export function createWebhookService(config: MetaConfig, inbox: InboxWriter) {
  return {
    verify(query: Record<string, unknown>): string {
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'];
      if (
        query['hub.mode'] !== 'subscribe' ||
        typeof token !== 'string' ||
        typeof challenge !== 'string' ||
        !/^\d{1,256}$/.test(challenge)
      ) {
        throw new WebhookError(400, 'INVALID_CHALLENGE');
      }
      const actual = createHash('sha256').update(token).digest();
      const expected = createHash('sha256').update(config.verifyToken).digest();
      if (!timingSafeEqual(actual, expected))
        throw new WebhookError(403, 'INVALID_VERIFY_TOKEN');
      return challenge;
    },
    async receive(body: Buffer, signature: string | undefined) {
      if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) {
        throw new WebhookError(401, 'INVALID_SIGNATURE');
      }
      const expected = createHmac('sha256', config.appSecret)
        .update(body)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
        throw new WebhookError(401, 'INVALID_SIGNATURE');
      }
      let payload: unknown;
      let changes;
      try {
        payload = JSON.parse(body.toString('utf8')) as unknown;
        const envelope = webhookSchema.parse(payload);
        if (envelope.entry.some((entry) => entry.id !== config.wabaId)) {
          throw new WebhookError(403, 'UNEXPECTED_ACCOUNT');
        }
        changes = parseWebhook(payload);
      } catch (error) {
        if (error instanceof WebhookError) throw error;
        throw new WebhookError(400, 'INVALID_PAYLOAD');
      }
      if (
        changes.some(
          (change) => change.metadata.phone_number_id !== config.phoneNumberId,
        )
      ) {
        throw new WebhookError(403, 'UNEXPECTED_PHONE_NUMBER');
      }
      const created = await inbox.accept(
        createHash('sha256').update(body).digest('hex'),
        payload,
      );
      return { created, changes: changes.length };
    },
  };
}

export type WebhookService = ReturnType<typeof createWebhookService>;
