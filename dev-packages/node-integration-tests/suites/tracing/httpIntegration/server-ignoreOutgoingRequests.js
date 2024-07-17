const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');
const http = require('http');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      ignoreOutgoingRequests: (url, request) => {
        if (url.includes('example.com')) {
          return true;
        }
        if (request.method === 'POST' && request.path === '/path') {
          return true;
        }
        return false;
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

app.get('/test', (_req, response) => {
  http
    .request('http://example.com/', res => {
      res.on('data', () => {});
      res.on('end', () => {
        response.send({ response: 'done' });
      });
    })
    .end();
});

app.post('/testPath', (_req, response) => {
  http
    .request('http://example.com/path', res => {
      res.on('data', () => {});
      res.on('end', () => {
        response.send({ response: 'done' });
      });
    })
    .end();
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
