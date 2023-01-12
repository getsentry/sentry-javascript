import type { Event } from '@sentry/node';

import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'non_serializable',
    contexts: {},
  });

  expect((event[0] as Event).contexts?.context_3).not.toBeDefined();
});
