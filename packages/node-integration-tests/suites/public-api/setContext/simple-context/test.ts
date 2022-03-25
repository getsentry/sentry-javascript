import { Event } from '@sentry/node';

import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should set a simple context', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'simple_context_object',
    contexts: {
      foo: {
        bar: 'baz',
      },
    },
  });

  expect((requestBody as Event).contexts?.context_3).not.toBeDefined();
});
