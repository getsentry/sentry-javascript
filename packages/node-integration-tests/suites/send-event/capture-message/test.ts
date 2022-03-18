import { assertSentryEvent, getEventRequest, runServer } from '../../../utils';

test('should send captureMessage', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'Message',
    level: 'info',
  });
});
