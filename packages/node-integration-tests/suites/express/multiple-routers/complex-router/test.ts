import { assertSentryEvent, TestEnv } from '../../../../utils/index';

test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route', async () => {
  const env = await TestEnv.init(__dirname, `${__dirname}/server.ts`);
  const event = await env.getEnvelopeRequest({
    url: env.url.replace('test', 'api/api/v1/sub-router/users/123/posts/456'),
  });
  assertSentryEvent(event[2] as any, {
    message: 'Custom Message',
    transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
  });
});
