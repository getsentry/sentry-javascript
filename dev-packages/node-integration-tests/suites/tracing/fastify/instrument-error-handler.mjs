import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.fastifyIntegration({
      shouldHandleError: (_error, request, _reply) => {
        if (request.routeOptions?.url?.includes('/test-error-not-captured')) {
          // Errors from this path will not be captured by Sentry
          return false;
        }

        return true;
      },
    }),
  ],
});
