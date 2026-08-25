const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

const url = process.env.SERVER_URL;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      // Each hook derives its attribute from the objects it is handed, so a hook that fires with
      // the wrong span, request or response fails the assertion rather than passing silently.
      outgoingRequestHook: (span, request) => {
        span.setAttribute('outgoingRequestHook', request.method);
      },
      outgoingResponseHook: (span, response) => {
        span.setAttribute('outgoingResponseHook', response.statusCode);
      },
      outgoingRequestApplyCustomAttributes: (span, request, response) => {
        span.setAttribute('outgoingRequestApplyCustomAttributes', `${request.method} ${response.statusCode}`);
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

app.get('/testOutgoing', (_req, response) => {
  makeHttpRequest(`${url}/api/users/42`).then(() => {
    response.send({ response: 'done' });
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
