import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const env = await TestEnv.init(__dirname);
  const events = await env.getEnvelopeRequest();

  assertSentryEvent(events[2], {
    message: 'test_multi_breadcrumbs',
    breadcrumbs: [
      {
        category: 'foo',
        message: 'bar',
        level: 'fatal',
      },
      {
        category: 'qux',
      },
    ],
  });
});
