import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should set a simple extra', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
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
