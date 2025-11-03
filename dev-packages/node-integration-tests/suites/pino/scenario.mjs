import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({ name: 'myapp' });

const ignoredLogger = pino({ name: 'ignored' });
Sentry.pinoIntegration.untrackLogger(ignoredLogger);

ignoredLogger.info('this will not be tracked');

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'startup' }, () => {
    logger.info({ user: 'user-id', something: { more: 3, complex: 'nope' } }, 'hello world');
  });
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    Sentry.startSpan({ name: 'later' }, () => {
      const child = logger.child({ module: 'authentication' });
      child.error(new Error('oh no'));
    });
  });
}, 1000);
