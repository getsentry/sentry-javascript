import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should record multiple extras of different types', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
    message: 'multiple_extras',
    extra: {
      extra_1: { foo: 'bar', baz: { qux: 'quux' } },
      extra_2: false,
    },
  });
});
