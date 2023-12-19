import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should set different properties of a scope', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

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
