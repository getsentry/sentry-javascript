import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should add a simple breadcrumb', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
    message: 'test_simple',
    breadcrumbs: [
      {
        category: 'foo',
        message: 'bar',
        level: 'fatal',
      },
    ],
  });
});
