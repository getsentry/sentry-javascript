import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'non_serializable',
    extra: {},
  });
});
