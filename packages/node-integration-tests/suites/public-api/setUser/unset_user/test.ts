import type { Event } from '@sentry/node';

import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should unset user', async () => {
  const env = await TestEnv.init(__dirname);
  const events = await env.getMultipleEnvelopeRequest({ count: 3 });

  assertSentryEvent(events[0][2], {
    message: 'no_user',
  });

  expect((events[0] as Event).user).not.toBeDefined();

  assertSentryEvent(events[1][2], {
    message: 'user',
    user: {
      id: 'foo',
      ip_address: 'bar',
      other_key: 'baz',
    },
  });

  assertSentryEvent(events[2][2], {
    message: 'unset_user',
  });

  expect((events[2] as Event).user).not.toBeDefined();
});
