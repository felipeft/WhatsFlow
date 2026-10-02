import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { pino } from 'pino';
import { createApp } from '@/app.js';
import { createWebhookService } from '@/integrations/meta/webhook.service.js';
import { parseEnv } from '@/config/env-schema.js';
import { metaConfig, incoming, payload } from './meta-fixtures.js';

test('webhook HTTP: challenge, assinatura bruta, payload, deduplicação e falha de persistência', async () => {
  const logs: string[] = [];
  const stored = new Set<string>();
  let databaseUp = true;
  const service = createWebhookService(metaConfig, {
    accept: async (digest) => {
      if (!databaseUp) throw new Error('secret-database-password');
      const created = !stored.has(digest);
      stored.add(digest);
      return created;
    },
  });
  const logger = pino(
    { level: 'info' },
    {
      write: (line: string) => {
        logs.push(line);
      },
    },
  );
  const server = createApp({
    logger,
    checkDatabase: async () => undefined,
    metaWebhook: service,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/meta`;
  const post = (
    body: string,
    signature?: string,
    contentType = 'application/json',
  ) =>
    fetch(base, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-hub-signature-256':
          signature ??
          `sha256=${createHmac('sha256', metaConfig.appSecret).update(body).digest('hex')}`,
      },
      body,
    });
  try {
    const query = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': metaConfig.verifyToken,
      'hub.challenge': '123456',
    });
    const valid = await fetch(`${base}?${query}`);
    assert.equal(valid.status, 200);
    assert.equal(await valid.text(), '123456');
    query.set('hub.verify_token', 'wrong');
    assert.equal((await fetch(`${base}?${query}`)).status, 403);
    assert.equal((await fetch(base)).status, 400);
    const body = JSON.stringify(payload({ messages: [incoming] }), null, 2);
    assert.equal((await post(body, 'invalid')).status, 401);
    const alteredSignature = `sha256=${createHmac(
      'sha256',
      metaConfig.appSecret,
    )
      .update(body.trim() + ' ')
      .digest('hex')}`;
    assert.equal((await post(body, alteredSignature)).status, 401);
    assert.equal(stored.size, 0);
    assert.equal((await post(body)).status, 200);
    assert.equal((await post(body)).status, 200);
    assert.equal(stored.size, 1);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('{}')).status, 400);
    assert.equal(
      (
        await post(
          JSON.stringify(
            payload({ messages: [{ ...incoming, timestamp: 'invalid' }] }),
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (await post(JSON.stringify(payload({ messages: [incoming] }, '999999'))))
        .status,
      403,
    );
    const foreign = payload({ messages: [incoming] });
    foreign.entry[0]!.id = '999999';
    assert.equal((await post(JSON.stringify(foreign))).status, 403);
    assert.equal((await post(body, undefined, 'text/plain')).status, 415);
    assert.equal((await post('x'.repeat(1024 * 1024 + 1))).status, 413);
    databaseUp = false;
    assert.equal((await post(body)).status, 500);
    const output = logs.join('');
    for (const sensitive of [
      metaConfig.verifyToken,
      metaConfig.appSecret,
      incoming.text.body,
      incoming.from,
      'secret-database-password',
    ]) {
      assert.ok(!output.includes(sensitive));
    }
    assert.match(output, /meta_webhook_received/);
    assert.match(output, /meta_auth_failed/);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
});

test('configuração Meta opcional, estrita ao habilitar e sem valores em erros', () => {
  const base = { DATABASE_URL: 'postgresql://user:pass@localhost/db' };
  assert.equal(parseEnv(base).META_ENABLED, 'false');
  assert.throws(
    () =>
      parseEnv({
        ...base,
        META_ENABLED: 'true',
        META_ACCESS_TOKEN: 'do-not-expose',
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('do-not-expose'));
      return true;
    },
  );
  const enabled = {
    ...base,
    META_ENABLED: 'true',
    META_APP_SECRET: metaConfig.appSecret,
    META_VERIFY_TOKEN: metaConfig.verifyToken,
    META_ACCESS_TOKEN: metaConfig.accessToken,
    META_PHONE_NUMBER_ID: metaConfig.phoneNumberId,
    META_WABA_ID: metaConfig.wabaId,
    META_API_BASE_URL: metaConfig.apiBaseUrl,
    META_API_VERSION: metaConfig.apiVersion,
  };
  assert.equal(parseEnv(enabled).META_ENABLED, 'true');
  for (const url of [
    'http://graph.facebook.com',
    'https://evil.example',
    'https://graph.facebook.com@evil.example',
    'https://graph.facebook.com?token=secret',
  ]) {
    assert.throws(() => parseEnv({ ...enabled, META_API_BASE_URL: url }));
  }
});
