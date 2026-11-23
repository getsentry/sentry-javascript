import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// `@sentry/deno` has the same options in `denoHttpIntegration`.
const httpIntegration = Sentry.httpIntegration ?? Sentry.denoHttpIntegration;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // disable attaching headers to /test/* endpoints
  tracePropagationTargets: [/^(?!.*test).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    httpIntegration({
      ignoreRequestBody: url => {
        if (url.includes('/test-post-ignore-body')) {
          return true;
        }
        return false;
      },
    }),
  ],
});
