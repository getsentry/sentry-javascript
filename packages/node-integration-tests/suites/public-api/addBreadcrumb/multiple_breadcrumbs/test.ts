import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);

  assertSentryEvent(envelopes[1][2], {
    message: 'test_multi_breadcrumbs',
    breadcrumbs: [
      {
        category: 'foo',
        message: 'bar',
        level: 'critical',
      },
      {
        category: 'qux',
      },
    ],
  });
});
