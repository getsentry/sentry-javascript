import * as Sentry from '@sentry/node';
import pino from 'pino';

function createProxiedLogger(originalLogger) {
  return new Proxy(originalLogger, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === 'function') {
        return (...args) => {
          return value.apply(target, args);
        };
      }
      return value;
    }
  });
}

const baseLogger = pino({ name: 'proxied-app' });
const proxiedLogger = createProxiedLogger(baseLogger);

Sentry.pinoIntegration.trackLogger(proxiedLogger);

Sentry.withIsolationScope(() => {
  Sentry.startSpan({ name: 'startup' }, () => {
    proxiedLogger.info({ user: 'user-id', context: 'proxied' }, 'hello from proxied logger');
  });
});

setTimeout(() => {
  Sentry.withIsolationScope(() => {
    Sentry.startSpan({ name: 'later' }, () => {
      const child = proxiedLogger.child({ module: 'authentication' });
      child.error(new Error('oh no from proxied logger'));
    });
  });
}, 1000);
