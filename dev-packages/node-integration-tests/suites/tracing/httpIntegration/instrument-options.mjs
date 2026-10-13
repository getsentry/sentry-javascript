import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      onSpanCreated: (span, req, res) => {
        span.setAttribute('onSpanCreated', 'yes');
        span.setAttributes({
          'onSpanCreated.reqUrl': req.url,
          'onSpanCreated.reqMethod': req.method,
          'onSpanCreated.resUrl': res.req.url,
          'onSpanCreated.resMethod': res.req.method,
        });
      },
    }),
  ],
});
