import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should update user', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 4 });

  assertSentryEvent(envelopes[1][2], {
    message: 'first_user',
    user: {
      id: 'foo',
      ip_address: 'bar',
    },
  });

  assertSentryEvent(envelopes[3][2], {
    message: 'second_user',
    user: {
      id: 'baz',
    },
  });
});
