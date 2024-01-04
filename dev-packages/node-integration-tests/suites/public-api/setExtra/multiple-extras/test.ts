import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should record multiple extras of different types', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'multiple_extras',
    extra: {
      extra_1: { foo: 'bar', baz: { qux: 'quux' } },
      extra_2: false,
    },
  });
});
