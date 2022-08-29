import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should set a simple extra', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
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
