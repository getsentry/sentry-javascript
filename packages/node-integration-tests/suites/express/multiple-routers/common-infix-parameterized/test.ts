import { TestEnv, assertSentryEvent } from '../../../../utils/index';

test('should construct correct url with common infixes with multiple parameterized routers.', async () => {
  const env = await TestEnv.init(__dirname, `${__dirname}/server.ts`);
  const event = await env.getEnvelopeRequest({ url: env.url.replace('test', 'api/v1/user/3212') });

  assertSentryEvent(event[2] as any, {
    message: 'Custom Message',
    transaction: 'GET /api/v1/user/:userId',
  });
});
