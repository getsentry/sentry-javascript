import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple message string', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

  assertSentryEvent(event[2], {
    message: 'Message',
    level: 'info',
  });
});
