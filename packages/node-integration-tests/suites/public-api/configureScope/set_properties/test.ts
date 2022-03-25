import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should set different properties of a scope', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'configured_scope',
    tags: {
      foo: 'bar',
    },
    extra: {
      qux: 'quux',
    },
    user: {
      id: 'baz',
    },
  });
});
