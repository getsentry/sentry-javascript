import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should capture a simple message string', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'Message',
    level: 'info',
  });
});
