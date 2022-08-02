import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopes } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopes(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
    message: 'non_serializable',
    extra: {},
  });
});
