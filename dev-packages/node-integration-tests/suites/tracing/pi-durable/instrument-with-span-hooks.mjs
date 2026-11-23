import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.piDurableIntegration({
      onSpanStart: (span, call) => {
        span.setAttribute('test.start', call.operation === 'chat' ? 'chat' : call.args.city);
      },
      onSpanEnd: (span, call, { response }) => {
        span.setAttribute('test.end', call.operation === 'chat' ? response?.stopReason : response?.output?.[0]?.text);
      },
    }),
  ],
});
