import { Event } from '@sentry/node';

import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should normalize non-serializable context', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'non_serializable',
    contexts: {},
  });

  expect((requestBody as Event).contexts?.context_3).not.toBeDefined();
});
