import { assertSentryEvent, filterEnvelopeItems, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const config = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(config, { count: 2 }));

  assertSentryEvent(events[0], {
    message: 'non_serializable',
    extra: {},
  });
});
