import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should allow nested scoping', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 10 });

  assertSentryEvent(envelopes[1][2], {
    message: 'root_before',
    user: {
      id: 'qux',
    },
  });

  assertSentryEvent(envelopes[3][2], {
    message: 'outer_before',
    user: {
      id: 'qux',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(envelopes[5][2], {
    message: 'inner',
    tags: {
      foo: false,
      bar: 10,
    },
  });

  expect((envelopes[4][2] as Event).user).toBeUndefined();

  assertSentryEvent(envelopes[7][2], {
    message: 'outer_after',
    user: {
      id: 'baz',
    },
    tags: {
      foo: false,
    },
  });

  assertSentryEvent(envelopes[9][2], {
    message: 'root_after',
    user: {
      id: 'qux',
    },
  });
});
