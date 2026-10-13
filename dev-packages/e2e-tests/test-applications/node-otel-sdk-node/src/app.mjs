import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'node:http';

const app = express();
const port = 3030;
const tracer = trace.getTracer('node-otel-sdk-node');

app.get('/test-telemetry/:id', function (req, res) {
  tracer.startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    Sentry.captureException(new Error(`This is an exception with id ${req.params.id}`));

    span.end();

    res.json({ traceId, spanId });
  });
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

// Answers with the OpenTelemetry span the request ran under, so the test can check what the error
// captured by Sentry was linked to.
app.use(function onError(_err, _req, res, _next) {
  const spanContext = trace.getActiveSpan()?.spanContext();
  res.status(500).json({ traceId: spanContext?.traceId, spanId: spanContext?.spanId });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
