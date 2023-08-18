import { assertSentryEvent, TestEnv } from '../../../utils';

test('allows to use pluggable integrations from @sentry/node export', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    contexts: expect.objectContaining({
      TypeError: {
        baz: 42,
        foo: 'bar',
      },
    }),
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'foo',
          mechanism: {
            type: 'generic',
            handled: true,
          },
          stacktrace: {
            frames: expect.any(Array),
          },
        },
      ],
    },
  });
});
