import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should record multiple extras of different types', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 2 });
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'multiple_extras',
    extra: {
      extra_1: { foo: 'bar', baz: { qux: 'quux' } },
      extra_2: false,
    },
  });
});
