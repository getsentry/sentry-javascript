import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should allow nested scoping', async () => {
  const config = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(config, {count:10}));

  assertSentryEvent(events[0], {
    message: 'root_before',
    user: {
      id: 'qux',
    },
  });

  assertSentryEvent(events[1], {
    message: 'outer_before',
    user: {
      id: 'qux',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(events[2], {
    message: 'inner',
    tags: {
      foo: false,
      bar: 10,
    },
  });

  expect((events[2] as Event).user).toBeUndefined();

  assertSentryEvent(events[3], {
    message: 'outer_after',
    user: {
      id: 'baz',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(events[4], {
    message: 'root_after',
    user: {
      id: 'qux',
    },
  });
});
