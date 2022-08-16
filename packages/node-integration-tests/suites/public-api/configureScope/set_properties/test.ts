import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set different properties of a scope', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 2 });
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
