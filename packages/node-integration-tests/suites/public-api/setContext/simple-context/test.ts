import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple context', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getEnvelopeRequest(config);

  assertSentryEvent(envelopes[2], {
    message: 'simple_context_object',
    contexts: {
      foo: {
        bar: 'baz',
      },
    },
  });

  expect((envelopes[2] as Event).contexts?.context_3).not.toBeDefined();
});
