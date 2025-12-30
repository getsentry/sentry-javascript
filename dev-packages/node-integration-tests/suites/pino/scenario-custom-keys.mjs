import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({
  name: 'myapp',
  messageKey: 'message', // Custom key instead of 'msg'
  errorKey: 'error', // Custom key instead of 'err'
});

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'custom-keys-test' }, () => {
    logger.info({ user: 'user-123', action: 'custom-key-test' }, 'Custom message key');
  });
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    Sentry.startSpan({ name: 'error-custom-key' }, () => {
      logger.error(new Error('Custom error key'));
    });
  });
}, 500);
