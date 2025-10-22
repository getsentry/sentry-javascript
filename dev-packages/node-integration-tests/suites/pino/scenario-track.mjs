import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({ name: 'myapp' });
Sentry.pinoIntegration.trackLogger(logger);

const loggerIgnore = pino({ name: 'ignore' });

loggerIgnore.info('this should be ignored');

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'startup' }, () => {
    logger.info({ user: 'user-id', something: { more: 3, complex: 'nope' } }, 'hello world');
  });
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    Sentry.startSpan({ name: 'later' }, () => {
      // This child should be captured as we marked the parent logger to be tracked
      const child = logger.child({ module: 'authentication' });
      child.error(new Error('oh no'));

      // This child should be ignored
      const child2 = logger.child({ module: 'authentication.v2' });
      Sentry.pinoIntegration.untrackLogger(child2);
      child2.error(new Error('oh no v2'));

      // This should also be ignored as the parent is ignored
      const child3 = child2.child({ module: 'authentication.v3' });
      child3.error(new Error('oh no v3'));
    });
  });
}, 1000);
