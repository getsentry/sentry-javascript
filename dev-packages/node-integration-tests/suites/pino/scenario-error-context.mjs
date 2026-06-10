import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({ name: 'myapp' });

Sentry.withIsolationScope(() => {
  logger.error({ err: new Error('failed to fetch user'), requestId: 'abc-123' }, 'Failed to do X');
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    logger.error({ requestId: 'def-456' }, 'Something went wrong');
  });
}, 500);
