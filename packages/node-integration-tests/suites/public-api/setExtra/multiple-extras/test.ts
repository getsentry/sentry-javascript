import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should record multiple extras of different types', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

  assertSentryEvent(event[2], {
    message: 'multiple_extras',
    extra: {
      extra_1: { foo: 'bar', baz: { qux: 'quux' } },
      extra_2: false,
    },
  });
});
