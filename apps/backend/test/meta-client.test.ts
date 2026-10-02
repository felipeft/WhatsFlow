import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pino } from 'pino';
import { createMetaClient, MetaApiError } from '@/integrations/meta/client.js';
import { metaConfig } from './meta-fixtures.js';

const input = {
  id: '11111111-1111-4111-8111-111111111111',
  phoneNumberId: metaConfig.phoneNumberId,
  to: '5500000000000',
  content: { type: 'text' as const, text: { body: 'conteúdo privado' } },
};

test('cliente Meta usa bearer, versão, timeout e callback sem vazar conteúdo', async () => {
  const logs: string[] = [];
  const logger = pino(
    {},
    {
      write: (line: string) => {
        logs.push(line);
      },
    },
  );
  let requests = 0;
  const client = createMetaClient(metaConfig, logger, async (url, options) => {
    requests++;
    assert.equal(
      url,
      `https://graph.facebook.com/v25.0/${metaConfig.phoneNumberId}/messages`,
    );
    assert.equal(
      new Headers(options?.headers).get('authorization'),
      `Bearer ${metaConfig.accessToken}`,
    );
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    assert.equal(body.biz_opaque_callback_data, input.id);
    assert.equal(body.messaging_product, 'whatsapp');
    return Response.json({ messages: [{ id: 'wamid.synthetic' }] });
  });
  assert.equal(await client.send(input), 'wamid.synthetic');
  assert.equal(requests, 1);
  for (const secret of [
    metaConfig.accessToken,
    input.to,
    input.content.text.body,
  ])
    assert.ok(!logs.join('').includes(secret));
  assert.match(logs.join(''), /meta_message_accepted/);
});

test('cliente diferencia rejeição, rate limit, timeout e resultado incerto sem retry cego', async () => {
  const logger = pino({ level: 'silent' });
  const cases: Array<{
    status: number;
    code?: number;
    kind: MetaApiError['kind'];
  }> = [
    { status: 401, code: 190, kind: 'rejected' },
    { status: 400, code: 130497, kind: 'rejected' },
    { status: 429, kind: 'rate_limit' },
    { status: 400, code: 130429, kind: 'rate_limit' },
    { status: 503, kind: 'uncertain' },
    { status: 200, kind: 'uncertain' },
  ];
  for (const item of cases) {
    let calls = 0;
    const client = createMetaClient(metaConfig, logger, async () => {
      calls++;
      return Response.json(
        { error: { code: item.code, message: 'secret-provider-text' } },
        { status: item.status, headers: { 'Retry-After': '10' } },
      );
    });
    await assert.rejects(client.send(input), (error: unknown) => {
      assert.ok(error instanceof MetaApiError);
      assert.equal(error.kind, item.kind);
      assert.ok(!error.message.includes('secret-provider-text'));
      if (item.kind === 'rate_limit') assert.equal(error.retryAfterMs, 10000);
      return true;
    });
    assert.equal(calls, 1);
  }
  const timeoutClient = createMetaClient(
    metaConfig,
    logger,
    async (_url, options) => {
      await new Promise<void>((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('test watchdog')),
          1000,
        );
        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('private-timeout'));
        });
      });
      return new Response();
    },
  );
  await assert.rejects(
    timeoutClient.send(input),
    (error: unknown) =>
      error instanceof MetaApiError && error.kind === 'uncertain',
  );
});
