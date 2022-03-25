import { assertSentryEvent, getMultipleEventRequests, runServer } from '../../../../utils';

test('should capture with different severity levels', async () => {
  const url = await runServer(__dirname);
  const events = await getMultipleEventRequests(url, 7);

  assertSentryEvent(events[0], {
    message: 'debug_message',
    level: 'debug',
  });

  assertSentryEvent(events[1], {
    message: 'info_message',
    level: 'info',
  });

  assertSentryEvent(events[2], {
    message: 'warning_message',
    level: 'warning',
  });

  assertSentryEvent(events[3], {
    message: 'error_message',
    level: 'error',
  });

  assertSentryEvent(events[4], {
    message: 'fatal_message',
    level: 'fatal',
  });

  assertSentryEvent(events[5], {
    message: 'critical_message',
    level: 'critical',
  });

  assertSentryEvent(events[6], {
    message: 'log_message',
    level: 'log',
  });
});
