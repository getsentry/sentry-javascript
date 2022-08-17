import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

  assertSentryEvent(event[2], {
    message: 'non_serializable',
    extra: {},
  });
});
