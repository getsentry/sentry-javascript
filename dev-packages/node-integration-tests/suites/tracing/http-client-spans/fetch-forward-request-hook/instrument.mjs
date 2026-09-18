import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.nativeNodeFetchIntegration({
      requestHook: (span, req) => {
        span.setAttribute('sentry.request.hook', req.path);
      },
      responseHook: (span, { response, request }) => {
        span.setAttribute('sentry.response.hook.path', request.path);
        span.setAttribute('sentry.response.hook.status_code', response.statusCode);
      },
    }),
  ],
});
