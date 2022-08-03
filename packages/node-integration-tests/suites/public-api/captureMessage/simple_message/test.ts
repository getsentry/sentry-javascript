import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should capture a simple message string', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
    message: 'Message',
    level: 'info',
  });
});
