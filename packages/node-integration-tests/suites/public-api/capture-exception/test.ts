import { assertSentryEvent, getEventRequest, runServer } from '../../../utils';

test('should send captureException', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Captured Error',
        },
      ],
    },
  });
});
