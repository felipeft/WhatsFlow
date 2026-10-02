import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createDatabase } from '@/infrastructure/database.js';
import { createLogger } from '@/infrastructure/logger.js';
import { createMetaStore } from '@/integrations/meta/store.js';
import { createMetaWorker } from '@/integrations/meta/worker.service.js';
import { MetaApiError } from '@/integrations/meta/client.js';
import { createConversationService } from '@/modules/conversations/conversation.service.js';
import { createApp } from '@/app.js';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { incoming, metaConfig, payload } from '../meta-fixtures.js';

test('PostgreSQL real: transações, concorrência, recuperação e estados Meta (HTTP mockado)', async (t) => {
  assert.ok(
    process.env.TEST_DATABASE_URL,
    'Defina TEST_DATABASE_URL explicitamente; o teste cria/remove somente um schema isolado próprio.',
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  const schema = `whatsflow_test_${randomUUID().replaceAll('-', '')}`;
  const admin = createDatabase(url.toString());
  url.searchParams.set('schema', schema);
  const database = createDatabase(url.toString());
  const logger = createLogger('silent');
  const store = createMetaStore(database.client, logger);
  const db = database.client;
  const phone = metaConfig.phoneNumberId;
  const makeInput = () => ({
    requestId: randomUUID(),
    to: '5500000000000',
    message: {
      type: 'text' as const,
      text: { body: 'Somente teste sintético' },
    },
  });
  const processOne = async () => {
    const job = await store.claimInbox();
    assert.ok(job);
    await store.processInbox(job);
  };
  const receipt = (providerId: string, status: string, callback?: string) =>
    payload({
      statuses: [
        {
          id: providerId,
          status,
          recipient_id: '550000000000',
          timestamp: '1790726400',
          ...(callback ? { biz_opaque_callback_data: callback } : {}),
          ...(status === 'failed' ? { errors: [{ code: 130497 }] } : {}),
        },
      ],
    });
  try {
    await admin.client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of [
      '20260930000000_meta_channel',
      '20261002000000_conversations_history',
    ]) {
      const migration = await readFile(
        new URL(
          `../../prisma/migrations/${name}/migration.sql`,
          import.meta.url,
        ),
        'utf8',
      );
      for (const statement of migration
        .split(';')
        .filter((part) => part.trim()))
        await db.$executeRawUnsafe(statement);
    }

    await t.test(
      'admissão concorrente e mensagens duplicadas em envelopes diferentes',
      async () => {
        const body = payload({
          messages: [
            incoming,
            {
              ...incoming,
              id: 'wamid.image',
              type: 'image',
              image: { id: 'media-reference' },
            },
          ],
        });
        const accepted = await Promise.all(
          Array.from({ length: 8 }, () => store.accept('same-digest', body)),
        );
        assert.equal(accepted.filter(Boolean).length, 1);
        const claims = await Promise.all([
          store.claimInbox(),
          store.claimInbox(),
        ]);
        assert.equal(claims.filter(Boolean).length, 1);
        await store.processInbox(claims.find((job) => job !== undefined)!);
        await store.accept('rebatched-digest', body);
        await processOne();
        assert.equal(
          await db.channelMessage.count({ where: { direction: 'inbound' } }),
          2,
        );
        assert.equal(await db.conversation.count(), 1);
        assert.equal(await db.metaOutbox.count(), 0); // Nenhuma resposta automática.
      },
    );

    await t.test(
      'conversas são únicas sob concorrência e histórico/API são paginados',
      async () => {
        const peer = '5511999990001';
        const otherPeer = '5511999990002';
        for (const [digest, id, from] of [
          ['conversation-a1', 'wamid.conversation.a1', peer],
          ['conversation-a2', 'wamid.conversation.a2', peer],
          ['conversation-b1', 'wamid.conversation.b1', otherPeer],
        ] as const) {
          await store.accept(
            digest,
            payload({ messages: [{ ...incoming, id, from }] }),
          );
        }
        const jobs = await Promise.all([
          store.claimInbox(),
          store.claimInbox(),
          store.claimInbox(),
        ]);
        assert.equal(jobs.filter(Boolean).length, 3);
        await Promise.all(jobs.map((job) => store.processInbox(job!)));

        const conversation = await db.conversation.findUniqueOrThrow({
          where: {
            channel_phoneNumberId_externalContactId: {
              channel: 'whatsapp',
              phoneNumberId: phone,
              externalContactId: peer,
            },
          },
          include: { messages: true },
        });
        assert.equal(conversation.messages.length, 2);
        assert.ok(
          conversation.messages.every(
            (message) =>
              message.direction === 'inbound' &&
              message.conversationId === conversation.id,
          ),
        );
        assert.equal(
          await db.conversation.count({
            where: { phoneNumberId: phone, externalContactId: peer },
          }),
          1,
        );
        assert.equal(
          await db.conversation.count({
            where: { phoneNumberId: phone, externalContactId: otherPeer },
          }),
          1,
        );

        const outbound = makeInput();
        outbound.to = peer;
        await store.enqueue(phone, outbound);
        const outboundMessage = await db.channelMessage.findUniqueOrThrow({
          where: { id: outbound.requestId },
        });
        assert.equal(outboundMessage.direction, 'outbound');
        assert.equal(outboundMessage.conversationId, conversation.id);
        const refreshed = await db.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
          include: { messages: true },
        });
        assert.equal(refreshed.messages.length, 3);
        assert.equal(
          refreshed.lastMessageAt.getTime(),
          Math.max(
            ...refreshed.messages.map((item) => item.occurredAt.getTime()),
          ),
        );

        const service = createConversationService(db);
        const server = createApp({
          logger,
          checkDatabase: async () => undefined,
          conversations: service,
        }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conversations`;
        try {
          const first = await fetch(`${base}?limit=1`);
          assert.equal(first.status, 200);
          const firstBody = (await first.json()) as {
            data: Array<{ id: string }>;
            page: { nextCursor: string | null };
          };
          assert.equal(firstBody.data.length, 1);
          assert.ok(firstBody.page.nextCursor);
          const second = await fetch(
            `${base}?limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor!)}`,
          );
          const secondBody = (await second.json()) as {
            data: Array<{ id: string }>;
          };
          assert.equal(second.status, 200);
          assert.notEqual(secondBody.data[0]?.id, firstBody.data[0]?.id);

          assert.equal((await fetch(`${base}/${conversation.id}`)).status, 200);
          const history = await fetch(
            `${base}/${conversation.id}/messages?limit=2`,
          );
          assert.equal(history.status, 200);
          const historyBody = (await history.json()) as {
            data: Array<{
              direction: string;
              occurredAt: string;
              text: string | null;
            }>;
            page: { nextCursor: string | null };
          };
          assert.equal(historyBody.data.length, 2);
          assert.ok(historyBody.page.nextCursor);
          assert.ok(
            historyBody.data[0]!.occurredAt <= historyBody.data[1]!.occurredAt,
          );
          assert.ok(historyBody.data.every((message) => message.text !== null));
          const nextHistory = await fetch(
            `${base}/${conversation.id}/messages?limit=2&cursor=${encodeURIComponent(historyBody.page.nextCursor!)}`,
          );
          const nextHistoryBody = (await nextHistory.json()) as {
            data: Array<{ direction: string }>;
          };
          assert.equal(nextHistoryBody.data.length, 1);
          assert.equal(nextHistoryBody.data[0]?.direction, 'outbound');
          assert.equal((await fetch(`${base}/invalid`)).status, 400);
          assert.equal((await fetch(`${base}/${randomUUID()}`)).status, 404);
        } finally {
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          });
        }

        const outbox = await store.claimOutbox(phone);
        assert.ok(outbox);
        await store.accepted(outbox, 'wamid.conversation.outbound');
      },
    );

    await t.test(
      'reserva de inbox expirada recupera; consumidor antigo não conclui',
      async () => {
        await store.accept(
          'expired-inbox',
          payload({ messages: [{ ...incoming, id: 'wamid.recovered' }] }),
        );
        const original = await store.claimInbox();
        assert.ok(original);
        await db.metaInbox.update({
          where: { id: original.id },
          data: { leaseUntil: new Date(0) },
        });
        const reclaimed = await store.claimInbox();
        assert.ok(reclaimed);
        await store.processInbox(original);
        assert.equal(
          (await db.metaInbox.findUniqueOrThrow({ where: { id: original.id } }))
            .state,
          'processing',
        );
        await store.processInbox(reclaimed);
        assert.equal(
          await db.channelMessage.count({
            where: { providerMessageId: 'wamid.recovered' },
          }),
          1,
        );
      },
    );

    await t.test(
      'enqueue idempotente, conflito explícito e mensagem/outbox atômicos',
      async () => {
        const input = makeInput();
        const ids = await Promise.all([
          store.enqueue(phone, input),
          store.enqueue(phone, input),
        ]);
        assert.deepEqual(ids, [input.requestId, input.requestId]);
        assert.equal(
          await db.metaOutbox.count({ where: { messageId: input.requestId } }),
          1,
        );
        await assert.rejects(
          store.enqueue(phone, { ...input, to: '5500000000001' }),
          /REQUEST_ID_CONFLICT/,
        );
        // Consumir a mensagem para não interferir nos cenários seguintes.
        const job = await store.claimOutbox(phone);
        assert.ok(job);
        await store.accepted(job, 'wamid.enqueue');
        await db.$executeRawUnsafe(
          `CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic failure''; END'`,
        );
        await db.$executeRawUnsafe(
          'CREATE TRIGGER fail_outbox BEFORE INSERT ON "MetaOutbox" FOR EACH ROW EXECUTE FUNCTION reject_test_outbox()',
        );
        const rejected = makeInput();
        await assert.rejects(store.enqueue(phone, rejected));
        assert.equal(
          await db.channelMessage.count({ where: { id: rejected.requestId } }),
          0,
        );
        await db.$executeRawUnsafe('DROP TRIGGER fail_outbox ON "MetaOutbox"');
      },
    );

    await t.test(
      'status adiantado, destinatário normalizado e ordem de entrega monotônica',
      async () => {
        const input = makeInput();
        await store.enqueue(phone, input);
        const job = await store.claimOutbox(phone);
        assert.ok(job);
        await store.accept(
          'early-delivery',
          receipt('wamid.early', 'delivered', `aaaaaaaa-${'-'.repeat(27)}`),
        );
        await processOne();
        await store.accepted(job, 'wamid.early');
        assert.equal(
          (await store.inspect(input.requestId))?.status,
          'delivered',
        );
        for (const status of ['read', 'sent', 'failed', 'delivered']) {
          await store.accept(
            `out-of-order-${status}`,
            receipt('wamid.early', status),
          );
          await processOne();
        }
        assert.equal((await store.inspect(input.requestId))?.status, 'read');
        assert.equal((await store.inspect(input.requestId))?.errorCode, null);
      },
    );

    await t.test(
      'falha 130497 posterior a HTTP 200 é registrada sem reenvio',
      async () => {
        const input = makeInput();
        await store.enqueue(phone, input);
        let calls = 0;
        const worker = createMetaWorker(
          store,
          {
            send: async () => {
              calls++;
              return 'wamid.restricted';
            },
          },
          phone,
          logger,
        );
        await worker.tick();
        assert.equal(
          (await store.inspect(input.requestId))?.status,
          'accepted',
        );
        await store.accept(
          'restricted-status',
          receipt('wamid.restricted', 'failed', input.requestId),
        );
        await worker.tick();
        await worker.tick();
        assert.equal((await store.inspect(input.requestId))?.status, 'failed');
        assert.equal((await store.inspect(input.requestId))?.errorCode, 130497);
        assert.equal(calls, 1);
      },
    );

    await t.test(
      'timeout não repete; callback reconcilia resultado incerto',
      async () => {
        const input = makeInput();
        await store.enqueue(phone, input);
        let calls = 0;
        const worker = createMetaWorker(
          store,
          {
            send: async () => {
              calls++;
              throw new MetaApiError('uncertain');
            },
          },
          phone,
          logger,
        );
        await worker.tick();
        await worker.tick();
        assert.equal(calls, 1);
        assert.equal(
          (await store.inspect(input.requestId))?.status,
          'uncertain',
        );
        await store.accept(
          'callback-after-timeout',
          receipt('wamid.timeout', 'sent', input.requestId),
        );
        await processOne();
        assert.equal((await store.inspect(input.requestId))?.status, 'sent');
      },
    );

    await t.test(
      'crash durante envio expira como incerto; troca do número não drena fila antiga',
      async () => {
        const input = makeInput();
        await store.enqueue(phone, input);
        const claims = await Promise.all([
          store.claimOutbox(phone),
          store.claimOutbox(phone),
        ]);
        assert.equal(claims.filter(Boolean).length, 1);
        const job = claims.find((item) => item !== undefined)!;
        await db.metaOutbox.update({
          where: { id: job.id },
          data: { leaseUntil: new Date(0) },
        });
        assert.equal(await store.claimOutbox(phone), undefined);
        assert.equal(
          (await store.inspect(input.requestId))?.status,
          'uncertain',
        );
        const old = makeInput();
        await store.enqueue('999999', old);
        assert.equal(await store.claimOutbox(phone), undefined);
        assert.equal((await store.inspect(old.requestId))?.status, 'queued');
      },
    );

    await t.test(
      'rate limit respeita atraso e máximo de cinco tentativas',
      async () => {
        const input = makeInput();
        await store.enqueue(phone, input);
        let calls = 0;
        const worker = createMetaWorker(
          store,
          {
            send: async () => {
              calls++;
              throw new MetaApiError('rate_limit', 429, 130429, 10000);
            },
          },
          phone,
          logger,
        );
        for (let i = 0; i < 5; i++) {
          await worker.tick();
          if (i < 4) {
            const status = await store.inspect(input.requestId);
            assert.ok(
              status?.outbox &&
                status.outbox.availableAt.getTime() > Date.now(),
            );
            await worker.tick();
            assert.equal(calls, i + 1);
            await db.metaOutbox.update({
              where: { messageId: input.requestId },
              data: { availableAt: new Date(0) },
            });
          }
        }
        assert.equal(calls, 5);
        assert.equal(
          (await store.inspect(input.requestId))?.outbox?.state,
          'dead',
        );
      },
    );
  } finally {
    await database.disconnect();
    // Apenas o schema aleatório criado por este teste; nunca resetar o banco do projeto.
    await admin.client.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
    );
    await admin.disconnect();
  }
});
