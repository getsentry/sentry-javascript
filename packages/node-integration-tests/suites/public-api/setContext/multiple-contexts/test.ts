import { Event } from '@sentry/node';

import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should record multiple contexts', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'multiple_contexts',
    contexts: {
      context_1: {
        foo: 'bar',
        baz: { qux: 'quux' },
      },
      context_2: { 1: 'foo', bar: false },
    },
  });

  expect((requestBody as Event).contexts?.context_3).not.toBeDefined();
});
