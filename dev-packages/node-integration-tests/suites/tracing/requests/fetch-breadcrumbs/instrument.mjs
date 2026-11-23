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
    // `@sentry/node` passes the undici request. The SDKs that patch the global `fetch` pass its arguments.
    const path = hint?.request ? hint.request.path : hint?.input && new URL(String(hint.input[0])).pathname;
    breadcrumb.data.ADDED_PATH = path;
    return breadcrumb;
  },
});
