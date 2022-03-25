import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should record an extras object', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'multiple_extras',
    extra: {
      extra_1: [1, ['foo'], 'bar'],
      extra_2: 'baz',
      extra_3: 3.141592653589793,
      extra_4: { qux: { quux: false } },
    },
  });
});
