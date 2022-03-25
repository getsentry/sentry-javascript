import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should set extras from multiple consecutive calls', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'consecutive_calls',
    extra: { extra: [], Infinity: 2, null: 0, obj: { foo: ['bar', 'baz', 1] } },
  });
});
