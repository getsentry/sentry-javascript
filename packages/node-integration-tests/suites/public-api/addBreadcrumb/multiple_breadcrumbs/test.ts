import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);

  assertSentryEvent(envelopes[1][2], {
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
