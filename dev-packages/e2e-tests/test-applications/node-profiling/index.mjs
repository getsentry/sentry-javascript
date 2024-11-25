import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

Sentry.startSpan({ name: 'Precompile test' }, async () => {
  await wait(500);
});

// Test that globalThis.require is not defined by any side effects of the profiling
// https://github.com/getsentry/sentry-javascript/issues/13662
if (globalThis.require !== undefined) {
  throw new Error('globalThis.require should not be defined, check that profiling integration is not defining it, received: ' + typeof globalThis.require);
}
