import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    message: 'non_serializable',
    contexts: {},
  });

  expect((events[0] as Event).contexts?.context_3).not.toBeDefined();
});
