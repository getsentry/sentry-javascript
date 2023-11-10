import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertSnapshot } from 'https://deno.land/std@0.202.0/testing/snapshot.ts';

import type { sentryTypes } from '../build-test/index.js';
import { sentryUtils } from '../build-test/index.js';
import { defaultIntegrations, DenoClient, Hub, Scope } from '../build/index.mjs';
import { getNormalizedEvent } from './normalize.ts';
import { makeTestTransport } from './transport.ts';

function getTestClient(
  callback: (event?: sentryTypes.Event) => void,
  integrations: sentryTypes.Integration[] = [],
): [Hub, DenoClient] {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    debug: true,
    integrations: [...defaultIntegrations, ...integrations],
    stackParser: sentryUtils.createStackParser(sentryUtils.nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      callback(getNormalizedEvent(envelope));
    }),
  });

  const scope = new Scope();
  const hub = new Hub(client, scope);

  return [hub, client];
}

function delay(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

Deno.test('captureException', async t => {
  let ev: sentryTypes.Event | undefined;
  const [hub] = getTestClient(event => {
    ev = event;
  });

  function something() {
    return new Error('Some unhandled error');
  }

  hub.captureException(something());

  await delay(200);
  await assertSnapshot(t, ev);
});

Deno.test('captureMessage', async t => {
  let ev: sentryTypes.Event | undefined;
  const [hub] = getTestClient(event => {
    ev = event;
  });

  hub.captureMessage('Some error message');

  await delay(200);
  await assertSnapshot(t, ev);
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
