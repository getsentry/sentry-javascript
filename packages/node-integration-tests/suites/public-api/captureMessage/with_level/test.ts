import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture with different severity levels', async () => {
  const config = await runServer(__dirname);
  const events = await getMultipleEnvelopeRequest(config, { count: 6 });

  assertSentryEvent(events[0][2], {
    message: 'debug_message',
    level: 'debug',
  });

  assertSentryEvent(events[1][2], {
    message: 'info_message',
    level: 'info',
  });

  assertSentryEvent(events[2][2], {
    message: 'warning_message',
    level: 'warning',
  });

  assertSentryEvent(events[3][2], {
    message: 'error_message',
    level: 'error',
  });

  assertSentryEvent(events[4][2], {
    message: 'fatal_message',
    level: 'fatal',
  });

  assertSentryEvent(events[5][2], {
    message: 'log_message',
    level: 'log',
  });
});
