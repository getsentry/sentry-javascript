import * as Sentry from '@sentry/node';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.raw());

app.get('/test/:id/span-updateName', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  rootSpan.updateName('new-name');
  res.send({ response: 'response 1' });
});

app.get('/test/:id/updateSpanName', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  Sentry.updateSpanName(rootSpan, 'new-name');
  res.send({ response: 'response 3' });
});

app.get('/test/:id/updateSpanNameAndSource', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  Sentry.updateSpanName(rootSpan, 'new-name');
  rootSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'component');
  res.send({ response: 'response 4' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
