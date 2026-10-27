// <reference lib="deno.ns" />

import * as Sentry from '@sentry/deno';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { errorSink, resetGlobals, withTimeout } from '../../src/index.ts';

Deno.test('parameterize from the public entry sends a message template and its values', async () => {
  resetGlobals();
  const sink = errorSink();

  Sentry.init({
    dsn: 'https://username@domain/123',
    beforeSend: sink.beforeSend,
  });

  const userId = 42;
  Sentry.captureMessage(Sentry.parameterize`User ${userId} logged in`);

  const event = await withTimeout(
    sink.waitFor(e => e.logentry?.message === 'User %s logged in'),
    5_000,
    'parameterized message event',
  );
  assertEquals(event.logentry, { message: 'User %s logged in', params: [42] });
});
