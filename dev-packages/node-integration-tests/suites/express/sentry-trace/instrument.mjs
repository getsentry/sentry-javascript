import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  // Disable attaching headers to /express endpoints so that only the outgoing
  // request to `somewhere.not.sentry` gets trace propagation.
  tracePropagationTargets: [/^(?!.*express).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
