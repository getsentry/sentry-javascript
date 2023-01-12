import type { Event } from '@sentry/node';

import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should set a simple context', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  assertSentryEvent(envelope[2], {
    message: 'simple_context_object',
    contexts: {
      foo: {
        bar: 'baz',
      },
    },
  });

  expect((envelope[2] as Event).contexts?.context_3).not.toBeDefined();
});
