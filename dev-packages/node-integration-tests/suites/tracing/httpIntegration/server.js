const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // disable attaching headers to /test/* endpoints
  tracePropagationTargets: [/^(?!.*test).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
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

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test', (_req, res) => {
  res.send({ response: 'response 1' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
