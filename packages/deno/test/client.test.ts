import process from 'node:process';
import type { Envelope, LogEnvelope, MetricEnvelope } from '@sentry/core';
import { parseEnvelope } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { DenoClient } from '../build/esm/index.js';
import { makeTestTransport } from './transport.ts';

Deno.test('flushes buffered logs and metrics before natural exit', async () => {
  const envelopes: Envelope[] = [];
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: () => {} }, async request => {
    envelopes.push(parseEnvelope(await request.text()));
    return new Response('');
  });

  try {
    const command = new Deno.Command('deno', {
      args: [
        'run',
        '--allow-net',
        '--allow-env',
        '--allow-read',
        new URL('./fixtures/flush-on-exit.ts', import.meta.url).pathname,
        `http://public@127.0.0.1:${server.addr.port}/1`,
      ],
      stdout: 'piped',
      stderr: 'piped',
    });

    const { code, stderr } = await command.output();

    assertEquals(code, 0, new TextDecoder().decode(stderr));
    assertEquals(envelopes.length, 2);
    const metricEnvelope = envelopes.find(envelope => envelope[1][0]?.[0].type === 'trace_metric') as
      | MetricEnvelope
      | undefined;
    const logEnvelope = envelopes.find(envelope => envelope[1][0]?.[0].type === 'log') as LogEnvelope | undefined;
    assertExists(metricEnvelope);
    assertExists(logEnvelope);
    assertEquals(
      metricEnvelope[1][0][1].items.map(({ name, type, value }) => ({ name, type, value })),
      [{ name: 'orders.completed', type: 'counter', value: 3 }],
    );
    assertEquals(
      logEnvelope[1][0][1].items.map(({ body, level }) => ({ body, level })),
      [{ body: 'Orders processed', level: 'info' }],
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test('removes its beforeExit listener when closed', async () => {
  const originalListeners = process.listeners('beforeExit');
  const client = new DenoClient({
    dsn: 'https://public@example.com/1',
    integrations: [],
    stackParser: () => [],
    transport: makeTestTransport(() => {}),
  });
  const addedListeners = process.listeners('beforeExit').filter(listener => !originalListeners.includes(listener));

  await client.close();

  assertEquals(addedListeners.length, 1);
  assertEquals(process.listeners('beforeExit'), originalListeners);
});
