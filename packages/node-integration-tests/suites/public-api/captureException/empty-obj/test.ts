import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should capture an empty object', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Non-Error exception captured with keys: [object has no keys]',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
  });
});
