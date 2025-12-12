import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({ name: 'myapp' });

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'startup' }, () => {
    // Omitting the message string and using the msg field instead
    logger.info({ msg: 'test-msg' });
    logger.info({ msg: 'test-msg-2', userId: 'user-123', action: 'login' });
    logger.info('test-string');
  });
});
