import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';
import http from 'http';

const app = express();

app.get('/test', (_req, res) => {
  http.get(`http://localhost:${app.port}/test2`, httpRes => {
    httpRes.on('data', () => {
      setTimeout(() => {
        res.send({ response: 'response 1' });
      }, 200);
    });
  });
});

app.get('/test2', (_req, res) => {
  res.send({ response: 'response 2' });
});

app.get('/test3', (_req, res) => {
  res.send({ response: 'response 3' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
