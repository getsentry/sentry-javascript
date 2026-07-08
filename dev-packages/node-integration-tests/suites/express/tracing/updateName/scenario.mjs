import * as Sentry from '@sentry/node';
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

app.get('/test/:id/span-updateName-source', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  rootSpan.updateName('new-name');
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
  res.send({ response: 'response 2' });
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
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'component');
  res.send({ response: 'response 4' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
