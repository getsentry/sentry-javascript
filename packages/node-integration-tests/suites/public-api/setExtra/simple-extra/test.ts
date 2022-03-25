import { assertSentryEvent, getEventRequest, runServer } from '../../../../utils';

test('should set a simple extra', async () => {
  const url = await runServer(__dirname);
  const requestBody = await getEventRequest(url);

  assertSentryEvent(requestBody, {
    message: 'simple_extra',
    extra: {
      foo: {
        foo: 'bar',
        baz: {
          qux: 'quux',
        },
      },
    },
  });
});
