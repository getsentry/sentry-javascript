import { TestEnv, assertSentryEvent } from '../../../../utils/index';

test('should construct correct urls with multiple routers.', async () => {
  const env = await TestEnv.init(__dirname, `${__dirname}/server.ts`);
  const event = await env.getEnvelopeRequest({ url: env.url.replace('test', 'api/v1/test/') });

  assertSentryEvent(event[2] as any, {
    message: 'Custom Message',
    transaction: 'GET /api/v1/test',
  });
});
