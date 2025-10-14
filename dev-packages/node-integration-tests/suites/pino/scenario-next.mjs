import * as Sentry from '@sentry/node';
import pino from 'pino-next';

const logger = pino({ name: 'myapp' });

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'startup' }, () => {
    logger.info({ user: 'user-id', something: { more: 3, complex: 'nope' } }, 'hello world');
  });
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    Sentry.startSpan({ name: 'later' }, () => {
      logger.error(new Error('oh no'));
    });
  });
}, 1000);
