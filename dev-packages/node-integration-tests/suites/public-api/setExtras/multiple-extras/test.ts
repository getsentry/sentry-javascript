import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should record an extras object', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'multiple_extras',
    extra: {
      extra_1: [1, ['foo'], 'bar'],
      extra_2: 'baz',
      extra_3: 3.141592653589793,
      extra_4: { qux: { quux: false } },
    },
  });
});
