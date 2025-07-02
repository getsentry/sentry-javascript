const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 0,
  transport: loggingTransport,
});

setupOtel(client);

// express must be required after Sentry is initialized
const express = require('express');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

const app = express();

app.get('/test', (_req, res) => {
  res.send({
    response: `
    <html>
      <head>
        ${Sentry.getTraceMetaTags()}
      </head>
      <body>
        Hi :)
      </body>
    </html>
    `,
  });
});

startExpressServerAndSendPortToRunner(app);
