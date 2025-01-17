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
        if (url === 'https://example.com/blockUrl') {
          return true;
        }

        if (request.hostname === 'example.com' && request.path === '/blockRequest') {
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

app.get('/testUrl', (_req, response) => {
  makeHttpRequest('https://example.com/blockUrl').then(() => {
    makeHttpRequest('https://example.com/pass').then(() => {
      response.send({ response: 'done' });
    });
  });
});

app.get('/testRequest', (_req, response) => {
  makeHttpRequest('https://example.com/blockRequest').then(() => {
    makeHttpRequest('https://example.com/pass').then(() => {
      response.send({ response: 'done' });
    });
  });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        res.on('data', () => {});
        res.on('end', () => {
          resolve();
        });
      })
      .on('error', error => {
        reject(error);
      });
  });
}
