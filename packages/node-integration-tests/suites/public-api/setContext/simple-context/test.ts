import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple context', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 1 });

  assertSentryEvent(envelopes[0][2], {
    message: 'simple_context_object',
    contexts: {
      foo: {
        bar: 'baz',
      },
    },
  });

  expect((envelopes[0][2] as Event).contexts?.context_3).not.toBeDefined();
});
