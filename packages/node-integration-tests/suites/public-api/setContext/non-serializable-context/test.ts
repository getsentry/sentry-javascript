import { Event } from '@sentry/node';

import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 2 });
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'non_serializable',
    contexts: {},
  });

  expect((errorEnvelope[2] as Event).contexts?.context_3).not.toBeDefined();
});
