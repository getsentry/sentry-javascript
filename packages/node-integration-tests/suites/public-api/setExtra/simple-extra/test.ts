import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple extra', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, { count: 2 });
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'simple_extra',
    extra: {
      foo: {
        foo: 'bar',
        baz: {
          qux: 'quux',
        },
      },
    },
  });
});
