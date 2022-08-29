import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should record multiple contexts', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    message: 'multiple_contexts',
    contexts: {
      context_1: {
        foo: 'bar',
        baz: { qux: 'quux' },
      },
      context_2: { 1: 'foo', bar: false },
    },
  });

  expect((events[0] as Event).contexts?.context_3).not.toBeDefined();
});
