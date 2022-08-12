import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple context', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'simple_context_object',
    contexts: {
      foo: {
        bar: 'baz',
      },
    },
  });

  expect((errorEnvelope[2] as Event).contexts?.context_3).not.toBeDefined();
});
