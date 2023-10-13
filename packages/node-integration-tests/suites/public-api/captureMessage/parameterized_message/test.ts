import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should capture a paramaterized representation of the message', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    logentry: {
      message: 'This is a log statement with %s and %s params',
      params: ['first', 'second'],
    },
  });
});
