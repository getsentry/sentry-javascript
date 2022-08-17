import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should set different properties of a scope', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config);

  assertSentryEvent(envelope[2], {
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
