import './instrument';

// Other imports below
import * as Sentry from '@sentry/node';
import { trace, type Span } from '@opentelemetry/api';
import express from 'express';

const app = express();
const port = 3030;

Sentry.setTag('root-level-tag', 'yes');

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (req, res) {
  Sentry.withActiveSpan(null, async () => {
    Sentry.startSpan({ name: 'test-transaction', op: 'e2e-test' }, () => {
      Sentry.startSpan({ name: 'test-span' }, () => undefined);
    });

    await fetch('http://localhost:3030/test-success');

    res.send({});
  });
});

app.get('/test-only-if-parent', function (req, res) {
  // Remove the HTTP span from the context to simulate no parent span
  Sentry.withActiveSpan(null, () => {
    // This should NOT create a span because onlyIfParent is true and there's no parent
    Sentry.startSpan({ name: 'test-only-if-parent', onlyIfParent: true }, () => {
      // This custom OTel span SHOULD be created and exported
      // This tests that custom OTel spans aren't suppressed when onlyIfParent triggers
      const customTracer = trace.getTracer('custom-tracer');
      customTracer.startActiveSpan('custom-span-with-only-if-parent', (span: Span) => {
        span.end();
      });
    });

    res.send({});
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-exception/:id', function (req, _res) {
  const id = req.params.id;
  Sentry.setTag(`param-${id}`, id);

  throw new Error(`This is an exception with id ${id}`);
});

app.get('/test-logs/:id', function (req, res) {
  const id = req.params.id;

  Sentry.startSpan({ name: `log-operation-${id}` }, () => {
    Sentry.logger.info(`test-log-${id}`, { requestId: id });
  });

  res.send({ ok: true, id });
});

Sentry.setupExpressErrorHandler(app);

app.use(function onError(err: unknown, req: any, res: any, next: any) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
