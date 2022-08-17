import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

  assertSentryEvent(event[2], {
    message: 'non_serializable',
    contexts: {},
  });

  expect((event as Event).contexts?.context_3).not.toBeDefined();
});
