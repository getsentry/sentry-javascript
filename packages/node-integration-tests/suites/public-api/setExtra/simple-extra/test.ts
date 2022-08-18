import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple extra', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

  assertSentryEvent(event[2], {
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
