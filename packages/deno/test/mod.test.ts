import type { Envelope, Event, Log } from '@sentry/core';
import { createStackParser, forEachEnvelopeItem, nodeStackLineParser } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertSnapshot } from 'https://deno.land/std@0.202.0/testing/snapshot.ts';
import { DenoClient, getCurrentScope, getDefaultIntegrations, logger, metrics, Scope } from '../build/esm/index.js';
import { getNormalizedEvent } from './normalize.ts';
import { makeTestTransport } from './transport.ts';

function getTestClient(callback: (event?: Event) => void): DenoClient {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    debug: true,
    integrations: getDefaultIntegrations({}),
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      callback(getNormalizedEvent(envelope));
    }),
  });

  client.init();
  getCurrentScope().setClient(client);

  return client;
}

function delay(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

Deno.test('captureException', async t => {
  let ev: Event | undefined;
  const client = getTestClient(event => {
    ev = event;
  });

  function something() {
    return new Error('Some unhandled error');
  }

  client.captureException(something());

  await delay(200);
  await assertSnapshot(t, ev);
});

Deno.test('captureMessage', async t => {
  let ev: Event | undefined;
  const client = getTestClient(event => {
    ev = event;
  });

  client.captureMessage('Some error message');

  await delay(200);
  await assertSnapshot(t, ev);
});

Deno.test('captureMessage twice', async t => {
  let ev: Event | undefined;
  const client = getTestClient(event => {
    ev = event;
  });

  client.captureMessage('Some error message');

  await delay(200);
  await assertSnapshot(t, ev);

  client.captureMessage('Another error message');

  await delay(200);
  await assertSnapshot(t, ev);
});

Deno.test('metrics.count captures a counter metric', async () => {
  const envelopes: Array<Envelope> = [];
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    integrations: getDefaultIntegrations({}),
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      envelopes.push(envelope);
    }),
  });

  client.init();
  const scope = new Scope();
  scope.setClient(client);

  metrics.count('test.counter', 5, { scope });

  await client.flush(2000);

  // deno-lint-ignore no-explicit-any
  let metricItem: any = undefined;
  for (const envelope of envelopes) {
    forEachEnvelopeItem(envelope, item => {
      const [headers, body] = item;
      if (headers.type === 'trace_metric') {
        metricItem = body;
      }
    });
  }

  assertEquals(metricItem !== undefined, true);
  assertEquals(metricItem.items.length, 1);
  assertEquals(metricItem.items[0].name, 'test.counter');
  assertEquals(metricItem.items[0].type, 'counter');
  assertEquals(metricItem.items[0].value, 5);
});

Deno.test('logger.info captures a log envelope item', async () => {
  const envelopes: Array<Envelope> = [];
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    enableLogs: true,
    integrations: getDefaultIntegrations({}),
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      envelopes.push(envelope);
    }),
  });

  client.init();
  const scope = new Scope();
  scope.setClient(client);

  logger.info('test log message', { key: 'value' }, { scope });

  await client.flush(2000);

  // deno-lint-ignore no-explicit-any
  let logItem: any = undefined;
  for (const envelope of envelopes) {
    forEachEnvelopeItem(envelope, item => {
      const [headers, body] = item;
      if (headers.type === 'log') {
        logItem = body;
      }
    });
  }

  assertEquals(logItem !== undefined, true);
  assertEquals(logItem.items.length, 1);
  assertEquals(logItem.items[0].level, 'info');
  assertEquals(logItem.items[0].body, 'test log message');
});

Deno.test('adds server.address to log attributes', () => {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    enableLogs: true,
    serverName: 'test-server',
    integrations: getDefaultIntegrations({}),
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(() => {}),
  });

  const log: Log = { level: 'info', message: 'test message', attributes: {} };
  client.emit('beforeCaptureLog', log);

  assertEquals(log.attributes?.['server.address'], 'test-server');
});

Deno.test('preserves existing log attributes when adding server.address', () => {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    enableLogs: true,
    serverName: 'test-server',
    integrations: getDefaultIntegrations({}),
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(() => {}),
  });

  const log: Log = { level: 'info', message: 'test message', attributes: { 'existing.attr': 'value' } };
  client.emit('beforeCaptureLog', log);

  assertEquals(log.attributes?.['existing.attr'], 'value');
  assertEquals(log.attributes?.['server.address'], 'test-server');
});

Deno.test('close() removes unload listener when enableLogs is true', async () => {
  const removeEventListenerCalls: Array<string> = [];
  const originalRemoveEventListener = globalThis.removeEventListener;
  globalThis.removeEventListener = ((event: string, ...args: unknown[]) => {
    removeEventListenerCalls.push(event);
    // deno-lint-ignore no-explicit-any
    return originalRemoveEventListener.call(globalThis, event, ...(args as [any]));
  }) as typeof globalThis.removeEventListener;

  try {
    const client = new DenoClient({
      dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
      enableLogs: true,
      integrations: getDefaultIntegrations({}),
      stackParser: createStackParser(nodeStackLineParser()),
      transport: makeTestTransport(() => {}),
    });

    await client.close();

    assertEquals(removeEventListenerCalls.includes('unload'), true);
  } finally {
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test('App runs without errors', async _ => {
  const cmd = new Deno.Command('deno', {
    args: ['run', '--allow-net=some-domain.com', './test/example.ts'],
    stdout: 'piped',
    stderr: 'piped',
  });

  const output = await cmd.output();
  assertEquals(output.success, true);

  const td = new TextDecoder();
  const outString = td.decode(output.stdout);
  const errString = td.decode(output.stderr);
  assertEquals(outString, 'App has started\n');
  assertEquals(errString, '');
});
