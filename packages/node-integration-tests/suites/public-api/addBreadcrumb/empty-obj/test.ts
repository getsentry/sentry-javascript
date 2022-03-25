import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should add an empty breadcrumb, when an empty object is given', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'test-empty-obj',
  });
});
