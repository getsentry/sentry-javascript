import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

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
