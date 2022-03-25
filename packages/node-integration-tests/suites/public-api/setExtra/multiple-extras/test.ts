import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should record multiple extras of different types', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'multiple_extras',
    extra: {
      extra_1: { foo: 'bar', baz: { qux: 'quux' } },
      extra_2: false,
    },
  });
});
