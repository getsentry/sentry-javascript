import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple message string', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    message: 'Message',
    level: 'info',
  });
});
