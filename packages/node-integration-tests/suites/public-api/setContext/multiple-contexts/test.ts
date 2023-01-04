import type { Event } from '@sentry/node';

import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should record multiple contexts', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  assertSentryEvent(envelope[2], {
    message: 'multiple_contexts',
    contexts: {
      context_1: {
        foo: 'bar',
        baz: { qux: 'quux' },
      },
      context_2: { 1: 'foo', bar: false },
    },
  });

  expect((envelope[0] as Event).contexts?.context_3).not.toBeDefined();
});
