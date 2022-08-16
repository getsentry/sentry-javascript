import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should capture a simple message string', async () => {
  const config = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(config,{count: 2}));

  assertSentryEvent(events[0], {
    message: 'Message',
    level: 'info',
  });
});
