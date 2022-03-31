import { assertSentryEvent, getEventRequest, runServer } from '../../../utils/index';

test('should capture and send Express controller error.', async () => {
  const url = await runServer(__dirname, `${__dirname}/server.ts`);
  const event = await getEventRequest(`${url}/express`);

  expect((event as any).exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);

  assertSentryEvent(event, {
    exception: {
      values: [
        {
          mechanism: {
            type: 'generic',
            handled: true,
          },
          type: 'Error',
          value: 'test_error',
        },
      ],
    },
  });
});
