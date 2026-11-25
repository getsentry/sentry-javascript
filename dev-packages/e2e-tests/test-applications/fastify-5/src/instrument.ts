import * as Sentry from '@sentry/node';
import { shouldHandleError } from './shouldHandleError';

// We wrap console.warn to find out if a warning is incorrectly logged
console.warn = new Proxy(console.warn, {
  apply: function (target, thisArg, argumentsList) {
    const msg = argumentsList[0];
    if (typeof msg === 'string' && msg.startsWith('[Sentry]')) {
      console.error(`Sentry warning was triggered: ${msg}`);
      process.exit(1);
    }

    return target.apply(thisArg, argumentsList);
  },
});

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  integrations: [Sentry.fastifyIntegration({ shouldHandleError })],
  tracesSampleRate: 1,
  tunnel: 'http://localhost:3031/', // proxy server
  tracePropagationTargets: ['http://localhost:3030', '/external-allowed'],
});
