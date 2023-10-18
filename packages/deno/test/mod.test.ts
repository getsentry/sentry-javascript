import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertSnapshot } from 'https://deno.land/std@0.202.0/testing/snapshot.ts';

import { createStackParser, nodeStackLineParser } from '../../utils/build/esm/index.js';
import { defaultIntegrations, DenoClient, Hub, Scope } from '../build/index.js';
import { getNormalizedEvent } from './normalize.ts';
import { makeTestTransport } from './transport.ts';

function getTestClient(callback: (event?: Event) => void, integrations: any[] = []): [Hub, DenoClient] {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    debug: true,
    integrations: [...defaultIntegrations, ...integrations],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      callback(getNormalizedEvent(envelope));
    }) as any,
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
  let ev: Event | undefined;
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
  let ev: Event | undefined;
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
