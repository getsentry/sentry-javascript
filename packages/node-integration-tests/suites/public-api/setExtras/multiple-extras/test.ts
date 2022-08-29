import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should record an extras object', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    message: 'multiple_extras',
    extra: {
      extra_1: [1, ['foo'], 'bar'],
      extra_2: 'baz',
      extra_3: 3.141592653589793,
      extra_4: { qux: { quux: false } },
    },
  });
});
