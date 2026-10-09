import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [],
  transport: loggingTransport,
  tracesSampleRate: 0.0,
  // Ensure this gets a correct hint
  beforeBreadcrumb(breadcrumb, hint) {
    breadcrumb.data = breadcrumb.data || {};
    const req = hint?.request;
    breadcrumb.data.ADDED_PATH = req?.path;
    return breadcrumb;
  },
});
