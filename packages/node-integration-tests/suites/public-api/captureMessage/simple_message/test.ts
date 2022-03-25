import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should capture a simple message string', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'Message',
    level: 'info',
  });
});
