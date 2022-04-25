import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set different properties of a scope', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'configured_scope',
    tags: {
      foo: 'bar',
    },
    extra: {
      qux: 'quux',
    },
    user: {
      id: 'baz',
    },
  });
});
