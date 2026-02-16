import type { Envelope, Event } from '@sentry/core';
import { createStackParser, forEachEnvelopeItem, nodeStackLineParser } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertSnapshot } from 'https://deno.land/std@0.202.0/testing/snapshot.ts';
import { DenoClient, getCurrentScope, getDefaultIntegrations, metrics, Scope } from '../build/esm/index.js';
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
