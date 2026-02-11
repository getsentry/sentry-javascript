import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
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
      instrumentation: {
        requestHook: (span, req) => {
          span.setAttribute('attr1', 'yes');
          Sentry.setExtra('requestHookCalled', {
            url: req.url,
            method: req.method,
          });
        },
        responseHook: (span, res) => {
          span.setAttribute('attr2', 'yes');
          Sentry.setExtra('responseHookCalled', {
            url: res.req.url,
            method: res.req.method,
          });
        },
        applyCustomAttributesOnSpan: (span, req, res) => {
          span.setAttribute('attr3', 'yes');
          Sentry.setExtra('applyCustomAttributesOnSpanCalled', {
            reqUrl: req.url,
            reqMethod: req.method,
            resUrl: res.req.url,
            resMethod: res.req.method,
          });
        },
      },
    }),
  ],
});
