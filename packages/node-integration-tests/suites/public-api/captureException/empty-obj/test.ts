import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should capture an empty object', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Object captured as exception with keys: [object has no keys]',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
  });
});
