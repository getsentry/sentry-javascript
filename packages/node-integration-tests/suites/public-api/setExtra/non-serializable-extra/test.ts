import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    message: 'non_serializable',
    extra: {},
  });
});
