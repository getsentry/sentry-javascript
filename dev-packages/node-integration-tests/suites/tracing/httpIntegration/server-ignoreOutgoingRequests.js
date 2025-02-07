const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

const url = process.env.SERVER_URL;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      ignoreOutgoingRequests: (url, request) => {
        if (url.endsWith('/blockUrl')) {
          return true;
        }

        if (request.path === '/blockRequest') {
          return true;
        }
        return false;
      },
    }),
  ],
});

const http = require('http');

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/testUrl', (_req, response) => {
  makeHttpRequest(`${url}/blockUrl`).then(() => {
    makeHttpRequest(`${url}/pass`).then(() => {
      response.send({ response: 'done' });
    });
  });
});

app.get('/testRequest', (_req, response) => {
  makeHttpRequest(`${url}/blockRequest`).then(() => {
    makeHttpRequest(`${url}/pass`).then(() => {
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
