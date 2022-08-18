import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const config = await runServer(__dirname);
  const events = await getMultipleEnvelopeRequest(config, { count: 1 });

  assertSentryEvent(events[0][2], {
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
