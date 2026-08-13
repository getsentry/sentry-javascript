import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      incomingRequestSpanHook: (span, req, res) => {
        span.setAttribute('incomingRequestSpanHook', 'yes');
        Sentry.setExtra('incomingRequestSpanHookCalled', {
          reqUrl: req.url,
          reqMethod: req.method,
          resUrl: res.req.url,
          resMethod: res.req.method,
        });
      },
    }),
  ],
});
