import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should record multiple contexts', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config, { count: 1 });

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

  expect((envelope[2] as Event).contexts?.context_3).not.toBeDefined();
});
