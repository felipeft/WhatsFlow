import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '@/app.js';
import { parseEnv } from '@/config/env-schema.js';
import { createLogger } from '@/infrastructure/logger.js';

test('configuração rejeita URL/porta inválidas sem expor credenciais', () => {
  assert.throws(
    () => parseEnv({ DATABASE_URL: 'secret', PORT: '70000' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /PORT/);
      assert.ok(!error.message.includes('secret'));
      return true;
    },
  );
  assert.equal(
    parseEnv({ DATABASE_URL: 'postgresql://user:pass@localhost/db' }).PORT,
    3000,
  );
});

test('liveness, readiness, falha do banco, correlação, JSON inválido e 404', async () => {
  let databaseUp = true;
  const server = createApp({
    logger: createLogger('silent'),
    checkDatabase: async () => {
      if (!databaseUp) throw new Error('password=never-expose');
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.match(health.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    databaseUp = false;
    const unavailable = await fetch(`${base}/health/ready`);
    assert.equal(unavailable.status, 503);
    assert.ok(!(await unavailable.text()).includes('never-expose'));
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    const malformed = await fetch(`${base}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{secret',
    });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes('secret'));
    const oversized = await fetch(`${base}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(20000) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});
