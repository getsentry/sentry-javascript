import { Event } from '@sentry/node';

import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should clear previously set properties of a scope', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'cleared_scope',
    tags: {},
    extra: {},
  });

  expect((requestBody as Event).user).not.toBeDefined();
});
