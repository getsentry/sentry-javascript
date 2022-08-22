import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should add a simple breadcrumb', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

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
