import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should clear previously set properties of a scope', async () => {
  const url = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(url);

  assertSentryEvent(envelope[2], {
    message: 'cleared_scope',
    tags: {},
    extra: {},
  });

  expect((envelope[2] as Event).user).not.toBeDefined();
});
