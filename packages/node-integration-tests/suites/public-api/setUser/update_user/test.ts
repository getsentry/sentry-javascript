import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should update user', async () => {
  const env = await TestEnv.init(__dirname);
  const envelopes = await env.getMultipleEnvelopeRequest({ count: 2 });

  assertSentryEvent(envelopes[0][2], {
    message: 'first_user',
    user: {
      id: 'foo',
      ip_address: 'bar',
    },
  });

  assertSentryEvent(envelopes[1][2], {
    message: 'second_user',
    user: {
      id: 'baz',
    },
  });
});
