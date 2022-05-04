import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should add a simple breadcrumb', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);

  assertSentryEvent(envelopes[1][2], {
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
