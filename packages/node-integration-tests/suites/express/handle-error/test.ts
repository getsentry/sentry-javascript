import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../utils/index';

test('should capture and send Express controller error.', async () => {
  const { url, server, scope } = await runServer(__dirname, `${__dirname}/server.ts`);
  const event = await getEnvelopeRequest({ url: `${url}/express`, server, scope });

  expect((event[2] as any).exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);

  assertSentryEvent(event[2] as any, {
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
