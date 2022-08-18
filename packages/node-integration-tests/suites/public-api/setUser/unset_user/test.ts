import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should unset user', async () => {
  const config = await runServer(__dirname);
  const events = await getMultipleEnvelopeRequest(config, { count: 3 });

  assertSentryEvent(events[0][2], {
    message: 'no_user',
  });

  expect((events[0][2] as Event).user).not.toBeDefined();

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

  expect((events[2][2] as Event).user).not.toBeDefined();
});
