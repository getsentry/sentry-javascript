import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const client = Sentry.init({
  dsn: 'https://public@example.com/1',
  tracesSampleRate: process.env.NO_TRACING ? undefined : 1,
  transport: loggingTransport,
  integrations: process.env.FRAMEWORK_ROOT ? [Sentry.httpIntegration({ disableIncomingRequestSpans: true })] : [],
});

if (process.env.FRAMEWORK_ROOT === 'late-op') {
  client.on('spanEnd', span => {
    if (Sentry.getRootSpan(span) === span) span.setAttribute('sentry.op', 'http.server');
  });
}
