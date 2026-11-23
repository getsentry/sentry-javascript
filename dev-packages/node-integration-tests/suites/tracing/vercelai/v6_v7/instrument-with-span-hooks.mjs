import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.vercelAIIntegration({
      onSpanStart: (span, { type }) => {
        span.setAttribute('test.start', [type, Sentry.getCurrentScope().getScopeData().tags.privacy].join(':'));
      },
      onSpanEnd: (span, _call, { response }) => {
        const totalTokens = Sentry.spanToJSON(span).attributes['gen_ai.usage.total_tokens'];
        span.setAttribute('test.end', [totalTokens, response ? 'response' : 'no response'].join(':'));
      },
    }),
  ],
});
