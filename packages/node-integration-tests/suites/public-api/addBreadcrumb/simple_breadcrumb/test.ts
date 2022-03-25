import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should add a simple breadcrumb', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'test_simple',
    breadcrumbs: [
      {
        category: 'foo',
        message: 'bar',
        level: 'critical',
      },
    ],
  });
});
