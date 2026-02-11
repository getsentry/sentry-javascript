import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/', (_req, res) => {
  res.send({ response: 'response 0' });
});

app.get('/401', (_req, res) => {
  res.status(401).send({ response: 'response 401' });
});

app.get('/402', (_req, res) => {
  res.status(402).send({ response: 'response 402' });
});

app.get('/403', (_req, res) => {
  res.status(403).send({ response: 'response 403' });
});

app.get('/499', (_req, res) => {
  res.status(499).send({ response: 'response 499' });
});

app.get('/300', (_req, res) => {
  res.status(300).send({ response: 'response 300' });
});

app.get('/399', (_req, res) => {
  res.status(399).send({ response: 'response 399' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
