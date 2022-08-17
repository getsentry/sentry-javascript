import { Event } from '@sentry/node';

import { assertSentryEvent, filterEnvelopeItems, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const config = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(config, { count: 2 }));

  assertSentryEvent(events[0], {
    message: 'non_serializable',
    contexts: {},
  });

  expect((events[0] as Event).contexts?.context_3).not.toBeDefined();
});
