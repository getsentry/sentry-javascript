import type { Event } from '@sentry/node';

import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should clear previously set properties of a scope', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  assertSentryEvent(envelope[2], {
    message: 'cleared_scope',
  });

  expect((envelope[2] as Event).user).not.toBeDefined();
});
