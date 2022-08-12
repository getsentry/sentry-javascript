import { Event } from '@sentry/node';

import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should clear previously set properties of a scope', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config);

  assertSentryEvent(envelope[2], {
    message: 'cleared_scope',
  });

  expect((envelope[2] as Event).user).not.toBeDefined();
});
