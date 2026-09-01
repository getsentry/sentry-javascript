import './instrument';

// Other imports below
import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import express from 'express';
import * as http from 'http';

const app = express();
const port = 3030;
const tracer = trace.getTracer('node-otel-sdk-node');

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (_req, res) {
  Sentry.startSpan({ name: 'sentry-span' }, () => undefined);
  tracer.startActiveSpan('otel-span', span => span.end());

  res.send({ status: 'ok' });
});

app.get('/test-exception/:id', function (req, _res) {
  throw new Error(`This is an exception with id ${req.params.id}`);
});

app.get('/test-outgoing', function (_req, res) {
  http.get(`http://localhost:${port}/echo-headers`, response => {
    let body = '';
    response.on('data', chunk => (body += chunk));
    response.on('end', () => res.type('json').send(body));
  });
});

app.get('/echo-headers', function (req, res) {
  res.send(req.headers);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
