import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'non_serializable',
    extra: {},
  });
});
