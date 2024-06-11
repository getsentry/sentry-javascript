import { assertEquals } from 'https://deno.land/std@0.202.0/assert/assert_equals.ts';
import { assertSnapshot } from 'https://deno.land/std@0.202.0/testing/snapshot.ts';

import type { sentryTypes } from '../build-test/index.js';
import { getTestClient } from './client.ts';

function delay(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

Deno.test('captureException', async t => {
  let ev: sentryTypes.Event | undefined;
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
  let ev: sentryTypes.Event | undefined;
  const client = getTestClient(event => {
    ev = event;
  });

  client.captureMessage('Some error message');

  await delay(200);
  await assertSnapshot(t, ev);
});

Deno.test('captureMessage twice', async t => {
  let ev: sentryTypes.Event | undefined;
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
