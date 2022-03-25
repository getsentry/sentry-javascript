import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should add multiple breadcrumbs', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
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
