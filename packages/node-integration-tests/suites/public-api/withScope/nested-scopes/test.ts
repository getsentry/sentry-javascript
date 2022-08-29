import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should allow nested scoping', async () => {
  const config = await runServer(__dirname);
  const events = await getMultipleEnvelopeRequest(config, { count: 5 });

  assertSentryEvent(events[0][2], {
    message: 'root_before',
    user: {
      id: 'qux',
    },
  });

  assertSentryEvent(events[1][2], {
    message: 'outer_before',
    user: {
      id: 'qux',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(events[2][2], {
    message: 'inner',
    tags: {
      foo: false,
      bar: 10,
    },
  });

  expect((events[2] as Event).user).toBeUndefined();

  assertSentryEvent(events[3][2], {
    message: 'outer_after',
    user: {
      id: 'baz',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(events[4][2], {
    message: 'root_after',
    user: {
      id: 'qux',
    },
  });
});
