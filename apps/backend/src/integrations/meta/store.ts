import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { Prisma, type PrismaClient } from '@/generated/prisma/client.js';
import {
  deliveryRank,
  enqueueSchema,
  outboundSchema,
  parseWebhook,
} from './dto.js';
import type { EnqueueInput } from './dto.js';
import type { InboxWriter } from './webhook.service.js';
import { MetaApiError } from './client.js';

const LEASE_MS = 60000;
const MAX_ATTEMPTS = 5;
const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Transaction = Prisma.TransactionClient;

export interface Reservation {
  id: string;
  leaseToken: string;
  attempts: number;
}

export function createMetaStore(db: PrismaClient, logger: Logger) {
  const store = {
    async accept(digest: string, payload: unknown): Promise<boolean> {
      const result = await db.metaInbox.createMany({
        data: [{ digest, payload: asJson(payload) }],
        skipDuplicates: true,
      });
      return result.count === 1;
    },

    async enqueue(phoneNumberId: string, value: EnqueueInput) {
      const input = enqueueSchema.parse(value);
      return db.$transaction(async (tx) => {
        const content = asJson(input.message);
        const occurredAt = new Date();
        const conversationId = await ensureConversation(
          tx,
          phoneNumberId,
          input.to,
          occurredAt,
        );
        await tx.channelMessage.createMany({
          data: [
            {
              id: input.requestId,
              conversationId,
              phoneNumberId,
              direction: 'outbound',
              peer: input.to,
              type: input.message.type,
              content,
              status: 'queued',
              occurredAt,
            },
          ],
          skipDuplicates: true,
        });
        const message = await tx.channelMessage.findUniqueOrThrow({
          where: { id: input.requestId },
        });
        if (
          message.direction !== 'outbound' ||
          message.phoneNumberId !== phoneNumberId ||
          message.peer !== input.to ||
          JSON.stringify(outboundSchema.parse(message.content)) !==
            JSON.stringify(input.message)
        ) {
          throw new Error('REQUEST_ID_CONFLICT');
        }
        await tx.metaOutbox.createMany({
          data: [{ messageId: message.id }],
          skipDuplicates: true,
        });
        return message.id;
      });
    },

    async claimInbox(): Promise<Reservation | undefined> {
      await db.metaInbox.updateMany({
        where: {
          state: 'processing',
          leaseUntil: { lt: new Date() },
          attempts: { gte: MAX_ATTEMPTS },
        },
        data: { state: 'dead', leaseUntil: null, leaseToken: null },
      });
      const token = randomUUID();
      const rows = await db.$queryRaw<Reservation[]>`
        UPDATE "MetaInbox" SET "state" = 'processing', "attempts" = "attempts" + 1,
          "leaseToken" = ${token}, "leaseUntil" = NOW() + ${LEASE_MS} * INTERVAL '1 millisecond'
        WHERE "id" = (SELECT "id" FROM "MetaInbox"
          WHERE ("state" = 'pending' AND "availableAt" <= NOW())
             OR ("state" = 'processing' AND "leaseUntil" < NOW())
          ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING "id", "leaseToken", "attempts"`;
      return rows[0];
    },

    async processInbox(job: Reservation) {
      const counts = await db.$transaction(async (tx) => {
        // Lock e token impedem um consumidor vencido de concluir a reserva de outro.
        const rows = await tx.$queryRaw<Array<{ payload: Prisma.JsonValue }>>`
          SELECT "payload" FROM "MetaInbox" WHERE "id" = ${job.id}::uuid
            AND "state" = 'processing' AND "leaseToken" = ${job.leaseToken} FOR UPDATE`;
        const deliveryEvents: Array<{
          status: string;
          errorCode: number | null;
        }> = [];
        if (!rows[0]) return { received: 0, statuses: 0, deliveryEvents };
        const changes = parseWebhook(rows[0].payload);
        let received = 0;
        let statuses = 0;
        for (const change of changes) {
          const phoneNumberId = change.metadata.phone_number_id;
          for (const message of change.messages ?? []) {
            const occurredAt = new Date(Number(message.timestamp) * 1000);
            const conversationId = await ensureConversation(
              tx,
              phoneNumberId,
              message.from,
              occurredAt,
            );
            const result = await tx.channelMessage.createMany({
              data: [
                {
                  conversationId,
                  phoneNumberId,
                  providerMessageId: message.id,
                  direction: 'inbound',
                  peer: message.from,
                  type: message.type,
                  content: asJson(message),
                  status: 'received',
                  providerTimestamp: occurredAt,
                  occurredAt,
                },
              ],
              skipDuplicates: true,
            });
            received += result.count;
          }
          for (const receipt of change.statuses ?? []) {
            const id = createHash('sha256')
              .update(
                JSON.stringify([
                  phoneNumberId,
                  receipt.id,
                  receipt.status,
                  receipt.timestamp,
                ]),
              )
              .digest('hex');
            const result = await tx.metaDelivery.createMany({
              data: [
                {
                  id,
                  phoneNumberId,
                  providerMessageId: receipt.id,
                  peer: receipt.recipient_id,
                  status: receipt.status,
                  callbackId: receipt.biz_opaque_callback_data ?? null,
                  errorCode: receipt.errors?.[0]?.code ?? null,
                  providerTimestamp: new Date(Number(receipt.timestamp) * 1000),
                },
              ],
              skipDuplicates: true,
            });
            statuses += result.count;
            if (result.count)
              deliveryEvents.push({
                status: receipt.status,
                errorCode: receipt.errors?.[0]?.code ?? null,
              });
            await reconcileDelivery(tx, id);
          }
        }
        await tx.metaInbox.update({
          where: { id: job.id },
          data: {
            state: 'done',
            processedAt: new Date(),
            leaseUntil: null,
            leaseToken: null,
          },
        });
        return { received, statuses, deliveryEvents };
      });
      logger.info(
        {
          event: 'meta_inbox_processed',
          inboxId: job.id,
          received: counts.received,
          statuses: counts.statuses,
        },
        'Evento processado',
      );
      for (const event of counts.deliveryEvents) {
        logger.info(
          {
            event:
              event.status === 'failed'
                ? 'meta_delivery_failed'
                : 'meta_delivery_updated',
            inboxId: job.id,
            ...event,
          },
          'Estado de entrega recebido',
        );
      }
      if (counts.received)
        logger.info(
          {
            event: 'meta_message_received',
            inboxId: job.id,
            count: counts.received,
          },
          'Mensagens recebidas',
        );
    },

    async failInbox(job: Reservation) {
      await db.metaInbox.updateMany({
        where: { id: job.id, leaseToken: job.leaseToken, state: 'processing' },
        data: {
          state: job.attempts >= MAX_ATTEMPTS ? 'dead' : 'pending',
          leaseUntil: null,
          leaseToken: null,
          availableAt: new Date(
            Date.now() + 1000 * 2 ** Math.min(job.attempts, MAX_ATTEMPTS),
          ),
        },
      });
    },

    async claimOutbox(phoneNumberId: string): Promise<Reservation | undefined> {
      // A chamada HTTP pode ter sido aceita antes de um crash. Nunca repetir automaticamente.
      await db.$transaction(async (tx) => {
        const expired = await tx.$queryRaw<Array<{ messageId: string }>>`
          UPDATE "MetaOutbox" SET "state" = 'uncertain', "leaseToken" = NULL, "leaseUntil" = NULL
          WHERE "state" = 'processing' AND "leaseUntil" < NOW() RETURNING "messageId"`;
        if (expired.length)
          await tx.channelMessage.updateMany({
            where: {
              id: { in: expired.map((row) => row.messageId) },
              statusRank: { lt: 10 },
            },
            data: { status: 'uncertain' },
          });
      });
      const token = randomUUID();
      const rows = await db.$queryRaw<Reservation[]>`
        UPDATE "MetaOutbox" SET "state" = 'processing', "attempts" = "attempts" + 1,
          "leaseToken" = ${token}, "leaseUntil" = NOW() + ${LEASE_MS} * INTERVAL '1 millisecond'
        WHERE "id" = (SELECT o."id" FROM "MetaOutbox" o JOIN "ChannelMessage" m ON m."id" = o."messageId"
          WHERE o."state" = 'pending' AND o."availableAt" <= NOW() AND m."phoneNumberId" = ${phoneNumberId}
          ORDER BY o."createdAt", o."id" FOR UPDATE OF o SKIP LOCKED LIMIT 1)
        RETURNING "id", "leaseToken", "attempts"`;
      return rows[0];
    },

    async outgoing(job: Reservation) {
      const row = await db.metaOutbox.findFirst({
        where: { id: job.id, state: 'processing', leaseToken: job.leaseToken },
        include: { message: true },
      });
      if (!row) return undefined;
      return {
        id: row.message.id,
        phoneNumberId: row.message.phoneNumberId,
        to: row.message.peer,
        content: outboundSchema.parse(row.message.content),
      };
    },

    async accepted(job: Reservation, providerMessageId: string) {
      await db.$transaction(async (tx) => {
        const outbox = await tx.metaOutbox.findUniqueOrThrow({
          where: { id: job.id },
        });
        const message = await tx.channelMessage.findUniqueOrThrow({
          where: { id: outbox.messageId },
        });
        if (
          message.providerMessageId &&
          message.providerMessageId !== providerMessageId
        )
          throw new Error('PROVIDER_ID_CONFLICT');
        await tx.channelMessage.update({
          where: { id: message.id },
          data: { providerMessageId },
        });
        await tx.channelMessage.updateMany({
          where: { id: message.id, statusRank: { lt: 10 } },
          data: { status: 'accepted', statusRank: 10 },
        });
        await tx.metaOutbox.update({
          where: { id: job.id },
          data: { state: 'done', leaseUntil: null, leaseToken: null },
        });
        const receipts = await tx.metaDelivery.findMany({
          where: { phoneNumberId: message.phoneNumberId, providerMessageId },
        });
        for (const receipt of receipts) await reconcileDelivery(tx, receipt.id);
      });
    },

    async failed(job: Reservation, error: MetaApiError) {
      const retry = error.kind === 'rate_limit' && job.attempts < MAX_ATTEMPTS;
      const state = retry
        ? 'pending'
        : error.kind === 'uncertain'
          ? 'uncertain'
          : 'dead';
      await db.$transaction(async (tx) => {
        const changed = await tx.metaOutbox.updateMany({
          where: {
            id: job.id,
            leaseToken: job.leaseToken,
            state: 'processing',
          },
          data: {
            state,
            leaseToken: null,
            leaseUntil: null,
            availableAt: new Date(
              Date.now() +
                Math.max(error.retryAfterMs, 1000 * 2 ** job.attempts),
            ),
          },
        });
        if (!changed.count) return;
        const outbox = await tx.metaOutbox.findUniqueOrThrow({
          where: { id: job.id },
        });
        await tx.channelMessage.updateMany({
          where: { id: outbox.messageId, statusRank: { lt: 10 } },
          data: {
            status: retry
              ? 'queued'
              : state === 'uncertain'
                ? 'uncertain'
                : 'failed',
            errorCode: error.providerCode ?? null,
          },
        });
      });
    },

    async inspect(id: string) {
      return db.channelMessage.findUnique({
        where: { id },
        select: {
          id: true,
          direction: true,
          type: true,
          status: true,
          errorCode: true,
          createdAt: true,
          updatedAt: true,
          outbox: {
            select: { state: true, attempts: true, availableAt: true },
          },
        },
      });
    },
  } satisfies InboxWriter & Record<string, unknown>;
  return store;
}

async function ensureConversation(
  tx: Transaction,
  phoneNumberId: string,
  externalContactId: string,
  occurredAt: Date,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Conversation" (
      "id", "channel", "phoneNumberId", "externalContactId",
      "lastMessageAt", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), 'whatsapp', ${phoneNumberId}, ${externalContactId},
      ${occurredAt}, NOW(), NOW()
    )
    ON CONFLICT ("channel", "phoneNumberId", "externalContactId")
    DO UPDATE SET
      "lastMessageAt" = GREATEST("Conversation"."lastMessageAt", EXCLUDED."lastMessageAt"),
      "updatedAt" = CASE
        WHEN EXCLUDED."lastMessageAt" > "Conversation"."lastMessageAt" THEN NOW()
        ELSE "Conversation"."updatedAt"
      END
    RETURNING "id"`;
  if (!rows[0]) throw new Error('CONVERSATION_UPSERT_FAILED');
  return rows[0].id;
}

async function reconcileDelivery(tx: Transaction, receiptId: string) {
  const receipt = await tx.metaDelivery.findUniqueOrThrow({
    where: { id: receiptId },
  });
  const callbackId =
    receipt.callbackId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      receipt.callbackId,
    )
      ? receipt.callbackId
      : undefined;
  const message = await tx.channelMessage.findFirst({
    where: {
      // A Meta pode normalizar o destinatário brasileiro (ex.: nono dígito).
      // Correlação usa ID externo ou callback opaco + remetente, não igualdade de telefone.
      phoneNumberId: receipt.phoneNumberId,
      direction: 'outbound',
      OR: [
        { providerMessageId: receipt.providerMessageId },
        ...(callbackId ? [{ id: callbackId, providerMessageId: null }] : []),
      ],
    },
  });
  if (!message) return; // Guardar recibo órfão permite reconciliar após resposta HTTP.
  const rank = deliveryRank[receipt.status as keyof typeof deliveryRank];
  if (!rank) return;
  await tx.channelMessage.updateMany({
    where: { id: message.id, statusRank: { lt: rank } },
    data: {
      providerMessageId: receipt.providerMessageId,
      status: receipt.status,
      statusRank: rank,
      errorCode: receipt.status === 'failed' ? receipt.errorCode : null,
    },
  });
  await tx.metaOutbox.updateMany({
    where: { messageId: message.id },
    data: { state: 'done', leaseUntil: null, leaseToken: null },
  });
}

export type MetaStore = ReturnType<typeof createMetaStore>;
